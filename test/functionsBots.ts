import "mocha"
import { spawn } from "child_process"
import { createWriteStream } from "fs"
import { randomBytes } from "crypto"
import { expect } from "chai"
import { BehaviorSubject } from "rxjs"
import { Server, GameMode, Lobby, LobbyStatus } from "@daas/model"
import { Bots, Lobbies } from "@daas/db-adapter"
import { Communications, MessageType } from "@daas/communications"
import { getDotaClient } from "../src/getDotaClient"
import { wait } from "../src/support/wait"
import { LobbyMemberTeam } from "../src/enums/LobbyMemberTeam"
import { PlayerStatus } from "../src/interfaces/PlayerStatus"

export default async () => {
	let comms: Communications
	let lobby: Lobby
	let bots: Array<any>

	const getSteamID = (bot: any) => bot.ToSteamID(bot.AccountID).toString()
	const invitedBots = () => bots.slice(0, 10)

	describe("Instance Bots", () => {
		it("Create Dota Client for bots", async () => {
			bots = await Promise.all(
				// Offset 1 because the first bot is the one creating the lobby
				(await Bots.findAll(10, 1)).map(async it => {
					try {
						return await getDotaClient(it)
					} catch (e) {
						throw new Error(`Error on bot ${it.username} - ${e.message}`)
					}
				})
			)

			bots.forEach(it => expect(it.constructor.name).to.equal("Dota2Client"))
		})
	})

	describe("Write logs and test communications", () => {
		it("should be started successfully", () => {
			const core = spawn("npm", ["start", "test"], { env: process.env })
			core.stdout.pipe(createWriteStream("core.test.log"))
			core.stderr.pipe(createWriteStream("core.test.error.log"))

			process.on("SIGINT", () => core.kill())
			process.on("SIGTERM", () => core.kill())
		})

		it("should open communication and send messages", async () => {
			comms = await Communications.open("test")
			await comms.waitForMessage(MessageType.BOOT_OK, 3000)
			
			await comms.sendMessage(MessageType.DOTA_BOT_INFO, { botId: 1 })
			await comms.waitForMessage(MessageType.DOTA_OK)
		})
	})

	describe("Lobby creation", () => {
		it("should invite the players and send the lobby OK message", async () => {
			const inviteSubject = new BehaviorSubject<null>(null)

			invitedBots().forEach(bot => {
				bot.on("lobbyInviteUpdate", (invite: any) => {
					inviteSubject.next(null)
					bot.respondLobbyInvite(invite.group_id, true)
				})
			})

			lobby = await Lobbies.insert({
				name: `DAAS Test - ${randomBytes(2).toString("hex")}`,
				server: Server.BRAZIL,
				gameMode: GameMode.ALL_PICK,
				radiantHasFirstPick: true
			})

			const players = invitedBots().map((it, i) => ({
				steamId: getSteamID(it),
				isCaptain: i < 2,
				isRadiant: i % 2 === 0,
				isReady: false
			}))

			await Lobbies.concerning(lobby).Players.insert(players)
			// So we have the players in the lobby object
			lobby = (await Lobbies.findById(lobby.id))!

			await comms.sendMessage(MessageType.LOBBY_INFO, { lobbyId: lobby.id })
			await comms.waitForMessage(MessageType.LOBBY_OK, 15000)

			// Wait until all bots have received their invites
			await inviteSubject.take(bots.length).toPromise()

			const updatedLobby = (await Lobbies.findById(lobby.id))!
			expect(updatedLobby.status).to.equal(LobbyStatus.OPEN)
		})
	})

	describe("Player control", () => {
		/**
		 * Takes a bot from the lobby player list, and makes it
		 * join a team of the lobby.
		 *
		 * @param botTeamIsRadiant True to take a radiant bot, false to take a
		 * dire bot.
		 * @param joinTheRightTeam True to make the bot join their corresponding
		 * team, false to make it join the wrong team.
		 * @param nthPlayerInTeam Take the with the given index
		 * @returns The bot which was forced to join the team
		 */
		const makeBotJoinTeam = (
			botTeamIsRadiant: boolean,
			joinTheRightTeam: boolean,
			nthPlayerInTeam: number = 0
		) =>
			new Promise<any>((resolve, reject) => {
				try {
					console.log(lobby.players)
					const player = lobby.players.filter(
						it => it.isRadiant === botTeamIsRadiant
					)[nthPlayerInTeam]
					const bot = invitedBots().find(
						it => getSteamID(it) === player.steamId
					)!

					bot.joinPracticeLobbyTeam(
						nthPlayerInTeam + 1,
						(() => {
							if (botTeamIsRadiant) {
								if (joinTheRightTeam) {
									return LobbyMemberTeam.RADIANT
								} else {
									return LobbyMemberTeam.DIRE
								}
							} else {
								if (joinTheRightTeam) {
									return LobbyMemberTeam.DIRE
								} else {
									return LobbyMemberTeam.RADIANT
								}
							}
						})(),
						(err: any) => {
							if (err) {
								reject(err)
							} else {
								resolve(bot)
							}
						}
					)
				} catch (e) {
					reject(e)
				}
			})

		it(
			"should prevent players from joining the wrong team, and should " +
				"send messages in the chat",
			async () => {
				// Wait a bit, just in case the bots haven't finished joining
				// the lobby. The "a bit" part is debatable. Some times 1000 ms
				// will be enough, but some other times the network will be
				// slow and tests will start randomly failing. Valve,
				// ladies and gentlemen.
				await wait(10000)

				await Promise.all([
					makeBotJoinTeam(true, false),
					makeBotJoinTeam(false, false)
				])

				// Wait another bit, so the bot can kick
				// the players from their slot
				await wait(10000)

				const playersInATeam = bots[0].Lobby.members.filter(
					(it: any) => it.team !== LobbyMemberTeam.UNASSIGNED
				)
				expect(playersInATeam).to.have.length(0)
			}
		)

		it("should prevent players that haven't signed up from joining", async () => {
			const intruderBot = bots[bots.length - 1]

			await new Promise((resolve, reject) => {
				intruderBot.joinPracticeLobby(
					bots[0].Lobby.lobby_id,
					bots[0].Lobby.pass_key,
					(err: any) => {
						if (err) {
							reject(err)
						} else {
							resolve()
						}
					}
				)
			})

			// Wait a bit, so we know for sure that the bot has
			// kicked the intruder
			await wait(10000)

			expect(bots[0].Lobby.members).to.have.length(11)
		})

		it("should allow players to join the right team", async () => {
			await Promise.all([
				makeBotJoinTeam(true, true),
				makeBotJoinTeam(false, true)
			])

			// Wait a bit, so we know for sure that the bot has kept the
			// players in place.
			await wait(10000)

			const playersInATeam = bots[0].Lobby.members.filter(
				(it: any) => it.team !== LobbyMemberTeam.UNASSIGNED
			)
			expect(playersInATeam).to.have.length(2)
		})

		it("should send messages with player status updates", async () => {
			await Promise.all([
				(async () => {
					const messages = await comms.adapterMessageStream
						.filter(it => it.type === MessageType.PLAYER_STATUS_UPDATE)
						.map(it => it.info as PlayerStatus)
						.take(2)
						.toArray()
						.toPromise()

					const botIds = bots.map(getSteamID)

					messages.forEach(({ steamId, isReady }) => {
						expect(botIds).to.contain(steamId)
						expect(isReady).to.be.true
					})
				})(),
				makeBotJoinTeam(true, true, 1),
				makeBotJoinTeam(false, true, 1)
			])
		})

		it("should simulate starting the game when ten players join", async () => {
			await Promise.all([
				makeBotJoinTeam(true, true, 2),
				makeBotJoinTeam(false, true, 2),
				makeBotJoinTeam(true, true, 3),
				makeBotJoinTeam(false, true, 3),
				makeBotJoinTeam(true, true, 4),
				makeBotJoinTeam(false, true, 4)
			])

			await wait(500)

			const updatedLobby = (await Lobbies.findById(lobby.id))!
			expect(updatedLobby.status).to.equal(LobbyStatus.IN_PROGRESS)
		})
	})

	describe("Lobby Manager", () => {
		it("Kick one player", async () => {
			const players = invitedBots()
			const playerKicked = players[players.length - 1]
			console.log(playerKicked)
			console.log(bots[0].Lobby.members)

			await new Promise((resolve, reject) => {
				playerKicked.leavePracticeLobby((err: any) => {
						if (err) {
							reject(err)
						} else {
							resolve()
						}
					}
				)
			})

			await wait(10000)

			expect(bots[0].Lobby.members).to.have.length(11)
		})

		it("Invite player again", async() => {
			const newPlayerBot = bots[bots.length - 1]
			
			await new Promise((resolve, reject) => {
				newPlayerBot.joinPracticeLobby(
					bots[0].Lobby.lobby_id,
					bots[0].Lobby.pass_key,
					(err: any) => {
						if (err) {
							reject(err)
						} else {
							resolve()
						}
					}
				)
			})

			// Wait a bit, so we know for sure that the bot has
			// kicked the intruder
			await wait(10000)

			expect(bots[0].Lobby.members).to.have.length(10)
		})
	})

	describe("Communications", () => {
		it("should close comms successfully", async () => {
			await comms.close()
		})
	})

	describe("Cleanup", () => {
		it("all bots should be instructed to leave the lobby", () =>
			Promise.all(
				bots.map(
					it =>
						new Promise<void>((resolve, reject) =>
							it.leavePracticeLobby((err: any) => {
								if (err) {
									reject(err)
								} else {
									resolve()
								}
							})
						)
				)
			))
	})
}
