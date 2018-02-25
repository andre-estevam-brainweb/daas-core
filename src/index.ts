import { Bots, Lobbies } from "@daas/db-adapter"
import { Bot, BotStatus } from "@daas/model"
import { Communications, MessageType } from "@daas/communications"
import { Observable } from "rxjs"
import { getDotaClient } from "./getDotaClient"
import { LobbyManager } from "./LobbyManager"
import { errorHandler } from "./errorHandler"
import { wait } from "../test/support/wait"

let manager: LobbyManager

async function init(comms: Communications) {
	await comms.sendMessage(MessageType.BOOT_OK)
	console.log(
		"Sent BOOT_OK message to provider, now waiting for its response..."
	)

	const { info: { botId } } = await comms.waitForMessage(
		MessageType.DOTA_BOT_INFO,
		20000
	)
	console.log(`The provider sent the bot ID ${botId}. Querying bot...`)

	const bot =
		(await Bots.findById(botId)) ||
		(() => {
			throw new Error("The bot doesn't exist")
		})()

	console.log(
		`Attempting to log in Steam and connect to the Dota GC with bot ${
			bot.username
		}...`
	)
	const dota = await getDotaClient(bot)
	console.log("Connection successful, waiting for provider instructions...")

	await Bots.update(bot, { status: BotStatus.IDLE })

	await comms.sendMessage(MessageType.DOTA_OK)

	comms.adapterMessageStream
		.filter(it => it.type === MessageType.KILL_YOURSELF)
		.take(1)
		.subscribe(() => {
			console.log("The provider told me to kill myself. Let's do this.")
			gracefulShutdown(comms, bot)
				.catch(console.error)
		})

	const { info: { lobbyId } } = await comms.waitForMessage(
		MessageType.LOBBY_INFO
	)
	console.log(`The provider sent the lobby ID ${lobbyId}. Querying lobby...`)

	const lobby =
		(await Lobbies.findById(lobbyId)) ||
		(() => {
			throw new Error("The lobby doesn't exist")
		})()

	console.log(`Attempting to create lobby '${lobby.name}'...`)
	manager = await LobbyManager.create(comms, dota, lobby)

	await Bots.update(bot, { status: BotStatus.IN_LOBBY })
	await comms.sendMessage(MessageType.LOBBY_OK)

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

	errorHandler(
		manager.matchIdStream.flatMap(() =>
			Observable.fromPromise(Bots.update(bot, { status: BotStatus.IN_MATCH }))
		),
		"index/matchStartListener"
	)

	await manager.waitUntilResultOrCancellation()

	console.log("My work here is done. Waiting 5 seconds then shutting down...")
	await wait(5000)

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
	const requestId = process.argv[2]

	if (!requestId) {
		throw new Error("Attempt to boot daas-core without a request ID")
	}

	console.log(`Starting DaaS Core with request ID ${requestId}`)

	const comms = await Communications.open(requestId)

	try {
		await init(comms)
	} catch (e) {
		console.error("An unexpected error occurred")
		console.error(e)

		await gracefulShutdown(comms, undefined, manager)
	}
}

main().catch(console.error)

// TODO LobbyStatus closed
