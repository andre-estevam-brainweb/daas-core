import * as dotenv from "dotenv"

dotenv.config()

import { Bots, Lobbies } from "@daas/db-adapter"
import { Bot, BotStatus, LobbyStatus } from "@daas/model"
import { Communications, MessageType } from "@daas/communications"
import { Observable } from "rxjs"
import { getDotaClient } from "./getDotaClient"
import { LobbyManager } from "./LobbyManager"
import { errorHandler } from "./errorHandler"
import { wait } from "./support/wait"

let manager: LobbyManager

async function init(comms: Communications) {

	console.log('[ INITIATING DAAS CORE ] call: init()')

	await comms.sendMessage(MessageType.BOOT_OK)
	console.log("Sent the BOOT_OK message to provider, now waiting for its response...")

	const { info: { botId } } = await comms.waitForMessage(
		MessageType.DOTA_BOT_INFO,
		20000
	)
	console.log(`The provider sent the bot ID ${botId}. Querying bot...`)

	const bot = (await Bots.findById(botId)) || (() => {
		throw new Error("The bot doesn't exist")
	})()

	console.log(
		`Attempting to log in Steam and connect to the Dota GC with bot ${bot.username}...`
	)

	const dota = await getDotaClient(bot)

	console.log("Connection successful, waiting for provider instructions...")
	console.log("DOTA CLIENT: ", dota)

	console.log('Setting the bot status as IDLE')
	await Bots.update(bot, { status: BotStatus.IDLE })

	console.log('Sending the DOTA_OK message')
	await comms.sendMessage(MessageType.DOTA_OK)

	comms.adapterMessageStream
		.filter(it => it.type === MessageType.KILL_YOURSELF)
		.take(1)
		.subscribe(() => {
			console.log("The provider told me to kill myself. Let's do this. Goodbye cruel world.")
			gracefulShutdown(comms, bot).catch(console.error)
		})

	const response = await comms.waitForMessage(MessageType.LOBBY_INFO)


	if (!response) {
		console.log('No lobby received')
		return
	}

	console.log('A LOBBY_INFO message was received, content:', response)

	const { info: { lobbyId } } = response

	console.log(`The provider sent the lobby ID ${lobbyId}. Querying lobby...`)

	const lobby =
		(await Lobbies.findById(lobbyId)) ||
		(() => {
			throw new Error("The lobby doesn't exist")
		})()

	console.log(`Attempting to create lobby '${lobby.name}'...`)
	manager = await LobbyManager.create(comms, dota, lobby)


	console.log('Setting the bot status as IN_LOBBY')
	await Bots.update(bot, { status: BotStatus.IN_LOBBY })

	console.log('Sending the LOBBY_OK message')
	await comms.sendMessage(MessageType.LOBBY_OK)

	// Whenever a player status changes, save it to the database, and
	// forward the changes to the worker.
	errorHandler(
		manager.playerStatusUpdates.flatMap(it =>
			Observable.fromPromise(
				Promise.all([
					Lobbies.concerning(lobby).Players.update(it.steamId, {
						isReady: it.isReady
					}),
					comms.sendMessage(MessageType.PLAYER_STATUS_UPDATE, it)
				])
			)
		),
		"index/playerStatusUpdates"
	)

	// Whenever a match starts, update the bot status.
	errorHandler(
		manager.matchIdStream.flatMap(() =>
			Observable.fromPromise(Bots.update(bot, { status: BotStatus.IN_MATCH }))
		),
		"index/matchStartListener"
	)

	// Whenever the worker requests an invite resend, make the bot re-invite
	errorHandler(
		comms.adapterMessageStream
			.filter(it => it.type === MessageType.RESEND_INVITE)
			.map(it => it.info.playerSteamId as string)
			.map(it => manager.invite(it)),
		"index/resendInviteListener"
	)

	console.log('Waiting for the lobby to finish')
	const finalStatus = await manager.waitUntilResultOrCancellation()

	console.log('Lobby finished, final status is', finalStatus)
	await Lobbies.update(lobby, { status: finalStatus })

	console.log('Sending the GAME_FINISHED message')
	await comms.sendMessage(MessageType.GAME_FINISHED)

	console.log(`The final lobby status is ${LobbyStatus[finalStatus]}`)
	await wait(5000)

	console.log('Shutting down the machine, bye')
	await gracefulShutdown(comms, bot, manager)
}

async function gracefulShutdown(
	comms: Communications,
	bot?: Bot,
	lobbyManager?: LobbyManager
) {
	try {
		console.log("Attempting to shut down gracefully")

		await Promise.all<any>([
			comms.close(),
			...(bot ? [Bots.update(bot, { status: BotStatus.OFFLINE })] : []),
			...(lobbyManager ? [lobbyManager.shutdown()] : [])
		])

		process.exit(0)
	} catch (e) {
		console.error(
			"An unexpected error occurred while attempting a graceful shutdown"
		)
		console.error(e)

		process.exit(1)
	}
}

async function main() {
	console.log('[ INITIATING DAAS CORE ] call: main()')

	const requestId = process.argv[2]

	if (!requestId) {
		throw new Error("Attempt to boot daas-core without a request ID")
	}

	console.log(`Starting DaaS Core with request ID ${requestId}`)

	const comms = await Communications.open(requestId)

	try {
		await init(comms)

		// Cores shouldn't be alive for 3 hours. If any of them do, it's because
		// they haven't been properly killed by the worker.
		await wait(3 /*h*/ * 60 /*m*/ * 60 /*s*/ * 1000 /*ms*/)
		// noinspection ExceptionCaughtLocallyJS
		throw new Error("Alive for too long!")
	} catch (e) {
		console.error("An unexpected error occurred")
		console.error(e)

		await gracefulShutdown(comms, undefined, manager)
	}
}

main().catch(console.error)
