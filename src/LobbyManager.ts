import * as Long from "long"
import { GameMode, Lobby, LobbyStatus, MatchResult, Server } from "@daas/model"
import { Config, Lobbies } from "@daas/db-adapter"
import { Communications, MessageType } from "@daas/communications"
import { Subject, Observable } from "rxjs"
import { isNullOrUndefined } from "util"
import { CSODOTALobby } from "./interfaces/CSODOTALobby"
import { CDOTALobbyMember } from "./interfaces/CDOTALobbyMember"
import { LobbyMemberTeam } from "./enums/LobbyMemberTeam"
import { PlayerStatus } from "./interfaces/PlayerStatus"
import { errorHandler } from "./errorHandler"
import { DOTA_GameState } from "./interfaces/DOTA_GameState"
import { EMatchOutcome } from "./interfaces/EMatchOutcome"
import { wait } from "../test/support/wait"
const { SeriesType, ServerRegion, schema: DotaSchema } = require("dota2")

const GameVersion = DotaSchema.lookupEnum("DOTAGameVersion").values
const DotaGameMode = DotaSchema.lookupEnum("DOTA_GameMode").values
const CMPick = DotaSchema.lookupEnum("DOTA_CM_PICK").values
const DotaTVDelay = DotaSchema.lookupEnum("LobbyDotaTVDelay").values
const ChatChannelType = DotaSchema.lookupEnum("DOTAChatChannelType_t").values

export class LobbyManager {
	private readonly comms: Communications
	private readonly dota: any
	private lobby: Lobby
	private chatChannel: string | null = null

	private playersStatus: Array<PlayerStatus> = []

	private lobbyUpdateSubject = new Subject<CSODOTALobby>()
	private playersStatusSubject = new Subject<PlayerStatus>()

	get playerStatusUpdates() {
		return this.playersStatusSubject.asObservable()
	}
	get matchIdStream() {
		return this.lobbyUpdates
			.map(lobby => lobby.match_id)
			.filter(it => !isNullOrUndefined(it) && it.greaterThan(0))
			.map(it => it!.toString())
			.take(1)
	}

	private get lobbyUpdates() {
		return this.lobbyUpdateSubject.asObservable()
	}
	private get matchOutcomeUpdates() {
		return this.lobbyUpdates
			.filter(
				it => it.game_state === DOTA_GameState.DOTA_GAMERULES_STATE_POST_GAME
			)
			.filter(it => !!it.match_outcome && it.match_outcome > 0)
			.map(it => it.match_outcome)
			.take(1) as Observable<EMatchOutcome>
	}
	private get lobbyTimeoutStream() {
		return this.lobbyUpdates
			.take(1)
			.flatMap(() => Observable.fromPromise(Config.get()))
			.flatMap(it => Observable.fromPromise(wait(it.lobbyTimeout * 1000)))
			// Only send the timeout if the lobby hasn't started
			.filter(() => this.lobby.matchId === null)
	}

	constructor(comms: Communications, dota: any, lobby: Lobby) {
		this.comms = comms
		this.dota = dota
		this.lobby = lobby
	}

	public waitUntilResultOrCancellation(): Promise<LobbyStatus> {
		return Promise.race([
			this.matchOutcomeUpdates
				.take(1)
				.map(() => LobbyStatus.CLOSED)
				.toPromise(),
			this.lobbyTimeoutStream
				.take(1)
				.map(() => LobbyStatus.CANCELLED)
				.toPromise()
		])
	}

	public shutdown() {
		return new Promise(async (resolve, reject) => {
			try {
				this.dota.leavePracticeLobby((err: any) => {
					if (err) {
						reject(
							new Error(
								`An error occurred when trying to leave the lobby - ${err}`
							)
						)
					} else {
						this.playersStatusSubject.complete()
						this.lobbyUpdateSubject.complete()
						resolve()
					}
				})
			} catch (e) {
				reject(e)
			}
		})
	}

	private getServerRegion() {
		switch (this.lobby.server) {
			case Server.US_WEST:
				return ServerRegion.USWEST
			case Server.US_EAST:
				return ServerRegion.USEAST
			case Server.LUXEMBOURG:
				return ServerRegion.EUROPE
			case Server.KOREA:
				return ServerRegion.KOREA
			case Server.SINGAPORE:
				return ServerRegion.SINGAPORE
			case Server.DUBAI:
				return ServerRegion.DUBAI
			case Server.AUSTRALIA:
				return ServerRegion.AUSTRALIA
			case Server.STOCKHOLM:
				return ServerRegion.STOCKHOLM
			case Server.AUSTRIA:
				return ServerRegion.AUSTRIA
			case Server.BRAZIL:
				return ServerRegion.BRAZIL
			case Server.SOUTHAFRICA:
				return ServerRegion.SOUTHAFRICA
			case Server.PW_TELECOM_SHANGHAI:
				return ServerRegion.PWTELECOMSHANGHAI
			case Server.PW_UNICOM:
				return ServerRegion.PWUNICOM
			case Server.CHILE:
				return ServerRegion.CHILE
			case Server.PERU:
				return ServerRegion.PERU
			case Server.INDIA:
				return ServerRegion.INDIA
			case Server.PW_TELECOM_GUANGZHOU:
				return ServerRegion.PWTELECOMGUANGZHOU
			case Server.PW_TELECOM_ZHEJIANG:
				return ServerRegion.PWTELECOMZHEJIANG
			case Server.JAPAN:
				return ServerRegion.JAPAN
			case Server.PW_TELECOMWUHAN:
				return ServerRegion.PWTELECOMWUHAN
		}
	}

	private getGameMode() {
		switch (this.lobby.gameMode) {
			case GameMode.ALL_PICK:
				return DotaGameMode.DOTA_GAMEMODE_AP
			case GameMode.ALL_DRAFT:
				return DotaGameMode.DOTA_GAMEMODE_ALL_DRAFT
			case GameMode.CAPTAINS_MODE:
				return DotaGameMode.DOTA_GAMEMODE_CM
			case GameMode.RANDOM_DRAFT:
				return DotaGameMode.DOTA_GAMEMODE_RD
			case GameMode.SINGLE_DRAFT:
				return DotaGameMode.DOTA_GAMEMODE_SD
			case GameMode.ALL_RANDOM:
				return DotaGameMode.DOTA_GAMEMODE_AR
			case GameMode.CAPTAINS_DRAFT:
				return DotaGameMode.DOTA_GAMEMODE_CD
			case GameMode.ABILITY_DRAFT:
				return DotaGameMode.DOTA_GAMEMODE_ABILITY_DRAFT
			case GameMode.ONE_VS_ONE_MID:
				return DotaGameMode.DOTA_GAMEMODE_1V1MID
			case GameMode.TURBO:
				return DotaGameMode.DOTA_GAMEMODE_TURBO
		}
	}

	private getCMPick() {
		if (this.lobby.radiantHasFirstPick) {
			return CMPick.DOTA_CM_GOOD_GUYS
		} else {
			return CMPick.DOTA_CM_BAD_GUYS
		}
	}

	private async getLobbyOptions() {
		return {
			game_name: this.lobby.name,
			pass_key: this.lobby.password,
			server_region: this.getServerRegion(),
			game_mode: this.getGameMode(),
			game_version: GameVersion.GAME_VERSION_CURRENT,
			series_type: SeriesType.NONE,
			cm_pick: this.getCMPick(),
			allow_cheats: false,
			fill_with_bots: false,
			allow_spectating: true,
			radiant_series_wins: 0,
			dire_series_wins: 0,
			allchat: false,
			dota_tv_delay: DotaTVDelay.LobbyDotaTV_120,
			leagueid: (await Config.get()).leagueId
		}
	}

	private kickBotFromTeam() {
		return this.kickFromTeam(this.dota.AccountID)
	}

	private kickFromTeam(steamId: Long) {
		return new Promise<LobbyManager>((resolve, reject) => {
			try {
				this.dota.practiceLobbyKickFromTeam(steamId.low, (err: any) => {
					if (err) {
						reject(err)
					} else {
						resolve()
					}
				})
			} catch (e) {
				reject(e)
			}
		})
	}

	private kickFromLobby(steamId: Long) {
		return new Promise<LobbyManager>((resolve, reject) => {
			try {
				this.dota.practiceLobbyKick(steamId.low, (err: any) => {
					if (err) {
						reject(err)
					} else {
						resolve()
					}
				})
			} catch (e) {
				reject(e)
			}
		})
	}

	private sendMessageToLobby(message: string) {
		if (this.chatChannel) {
			// noinspection JSIgnoredPromiseFromCall - WebStorm is bugged
			this.dota.sendMessage(
				message,
				this.chatChannel,
				ChatChannelType.DOTAChannelType_Lobby
			)
		} else {
			// Keep retrying until we are on the chat channel
			setTimeout(() => {
				this.sendMessageToLobby(message)
			}, 2000)
		}
	}

	private inviteAll() {
		this.lobby.players.forEach(it => this.dota.inviteToLobby(it.steamId))
	}

	private launchLobby() {
		return new Promise<LobbyManager>(async (resolve, reject) => {
			try {
				const options = await this.getLobbyOptions()

				console.log(`Lobby options are: ${JSON.stringify(options)}`)

				this.dota.on("practiceLobbyUpdate", (lobby: CSODOTALobby) =>
					this.lobbyUpdateSubject.next(lobby)
				)

				this.playersStatus = this.lobby.players.map(it => ({
					steamId: it.steamId,
					isReady: false
				}))

				this.dota.createPracticeLobby(options, async (err: any) => {
					if (!err) {
						// For some reason the bot automatically joins the first slot. Kick him.
						await this.kickBotFromTeam()

						// Setup handlers
						this.handleLobbyTimeout()
						this.handleLobbyIdReceived()
						this.handleMatchIdReceived()
						this.handleGameResultReceived()
						this.handleMemberPositionUpdated()
						this.handlePlayerReady()

						this.inviteAll()
						resolve()

						const [newLobby] = await Promise.all([
							Lobbies.update(this.lobby, {
								status: LobbyStatus.OPEN
							}),
							this.comms.sendMessage(MessageType.LOBBY_OK)
						])
						this.lobby = newLobby
						console.log("Lobby creation successful")
					} else {
						throw new Error(
							`Failed to create lobby '${this.lobby.name}' - ${err}`
						)
					}
				})
			} catch (e) {
				reject(e)
			}
		})
	}

	private updatePlayerStatus(steamId: string, isReady: boolean) {
		const currentStatus = this.playersStatus.find(it => it.steamId === steamId)

		if (currentStatus && currentStatus.isReady !== isReady) {
			currentStatus.isReady = isReady
			this.playersStatusSubject.next({ steamId, isReady })
		}
	}

	private handleLobbyTimeout() {
		errorHandler(
			this.lobbyTimeoutStream.flatMap(() => {
				const notReadyPlayers = this.playersStatus
					.filter(it => !it.isReady)
					.map(it => it.steamId)

				console.log("The lobby has been cancelled")
				this.sendMessageToLobby(
					"The lobby has been cancelled because " +
						"players failed to join in time! Sorry!"
				)

				this.dota.configPracticeLobby(
					this.dota.Lobby.lobby_id,
					Object.assign(this.dota.Lobby, {
						game_name: `${this.lobby.name} (cancelled)`
					})
				)

				return Observable.fromPromise(
					Promise.all([
						Lobbies.update(this.lobby, { status: LobbyStatus.CANCELLED }).then(
							it => (this.lobby = it)
						),
						this.comms.sendMessage(MessageType.GAME_CANCELLED, notReadyPlayers)
					])
				)
			}),
			"handleLobbyTimeout"
		)
	}

	private handleLobbyIdReceived() {
		errorHandler(
			this.lobbyUpdates
				.map(lobby => lobby.lobby_id)
				.filter(it => !isNullOrUndefined(it))
				.take(1)
				.map(id => {
					this.chatChannel = `Lobby_${id}`
					this.dota.joinChat(
						this.chatChannel,
						ChatChannelType.DOTAChannelType_Lobby
					)
				}),
			"handleLobbyIdReceived"
		)
	}

	private handleMatchIdReceived() {
		errorHandler(
			this.matchIdStream.flatMap(id => {
				console.log(`The match ID is: ${id}`)
				return Observable.fromPromise(
					Promise.all([
						Lobbies.update(this.lobby, { matchId: id }).then(
							it => (this.lobby = it)
						),
						this.comms.sendMessage(MessageType.GAME_STARTED, { matchId: id })
					])
				)
			}),
			"handleMatchIdReceived"
		)
	}

	private handleGameResultReceived() {
		errorHandler(
			this.matchOutcomeUpdates.flatMap(it => {
				console.log("The match outcome is: ", EMatchOutcome[it])
				const matchResult = (() => {
					switch (it) {
						case EMatchOutcome.k_EMatchOutcome_RadVictory:
							return MatchResult.RADIANT_VICTORY
						case EMatchOutcome.k_EMatchOutcome_DireVictory:
							return MatchResult.DIRE_VICTORY
						default:
							return MatchResult.UNABLE_TO_DETERMINE
					}
				})()

				return Observable.fromPromise(
					Promise.all([
						Lobbies.update(this.lobby, { matchResult }).then(
							it => (this.lobby = it)
						),
						this.comms.sendMessage(MessageType.GAME_FINISHED, { matchResult })
					])
				)
			}),
			"handleMatchIdReceived"
		)
	}

	private handleMemberPositionUpdated() {
		errorHandler(
			this.lobbyUpdates
				.flatMap(
					lobby =>
						Observable.from(lobby.members) as Observable<CDOTALobbyMember>
				)
				.flatMap(player => {
					const steamId = player.id.toString()

					if (player.team === LobbyMemberTeam.UNASSIGNED) {
						// If the player is in unassigned, they haven't joined their position yet
						// Otherwise, they don't belong in this lobby, so kick them
						const playerBelongsInThisMatch =
							this.lobby.players.map(it => it.steamId).indexOf(steamId) !== -1
						const playerIsBot =
							player.id.toString() === this.dota.AccountID.toString()

						if (playerBelongsInThisMatch && !playerIsBot) {
							this.updatePlayerStatus(steamId, false)
							return Observable.empty()
						} else {
							return Observable.fromPromise(this.kickFromLobby(player.id))
						}
					} else {
						const expectedPosition = (() => {
							const playerData = this.lobby.players.find(
								it => it.steamId === steamId
							)

							if (!playerData) {
								return LobbyMemberTeam.UNASSIGNED
							} else if (playerData.isRadiant) {
								return LobbyMemberTeam.RADIANT
							} else {
								return LobbyMemberTeam.DIRE
							}
						})() as LobbyMemberTeam

						if (player.team === expectedPosition) {
							this.updatePlayerStatus(steamId, true)
							return Observable.empty()
						} else {
							const readableTeam = (() => {
								switch (expectedPosition) {
									case LobbyMemberTeam.RADIANT:
										return "Radiant"
									case LobbyMemberTeam.DIRE:
										return "Dire"
									case LobbyMemberTeam.CASTER:
										return "caster slots"
									case LobbyMemberTeam.COACH:
										return "coach slots"
								}
							})()
							this.sendMessageToLobby(
								readableTeam
									? `${player.name}, please join ${readableTeam}!`
									: `${player.name}, you're not allowed to join any team!`
							)
							return Observable.fromPromise(this.kickFromTeam(player.id))
						}
					}
				}),
			"handleMemberPositionUpdated"
		)
	}

	private handlePlayerReady() {
		errorHandler(
			this.playerStatusUpdates.filter(it => it.isReady).flatMap(() => {
				const allReady = this.playersStatus
					.map(it => it.isReady)
					.reduce((a, b) => a && b, true)

				if (allReady) {
					const promises: Array<Promise<any>> = []

					if (process.env.NODE_ENV !== "test") {
						promises.push(
							new Promise<void>((resolve, reject) => {
								this.dota.launchPracticeLobby((err: any) => {
									if (err) {
										reject(err)
									} else {
										resolve()
									}
								})
							})
						)
					}

					promises.push(
						Lobbies.update(this.lobby, {
							status: LobbyStatus.IN_PROGRESS
						}).then(it => (this.lobby = it))
					)

					return Observable.fromPromise(Promise.all(promises))
				} else {
					return Observable.empty()
				}
			}),
			"handlePlayerReady"
		)
	}

	static async create(comms: Communications, dota: any, lobby: Lobby) {
		const manager = new LobbyManager(comms, dota, lobby)
		await manager.launchLobby()
		return manager
	}
}
