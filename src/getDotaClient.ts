import { Bot } from "@daas/model"
const {
	SteamClient,
	SteamUser,
	SteamFriends,
	EResult,
	EPersonaState
} = require("steam")
const { Dota2Client } = require("dota2")

export const getDotaClient = (bot: Bot) =>
	new Promise<any>(async (resolve, reject) => {
		try {
			const steamClient = new SteamClient()
			const steamUser = new SteamUser(steamClient)
			const steamFriends = new SteamFriends(steamClient)
			const dota = new Dota2Client(steamClient, false, false)

			steamClient.on("error", (err: any) => {
				reject(err)
			})

			steamClient.on("connected", (err: any) => {
				if (!err) {
					const logInDetails = {} as any

					logInDetails.account_name = bot.username
					logInDetails.password = bot.password

					if (bot.sentryFile) {
						logInDetails.sha_sentryfile = bot.sentryFile
					}

					steamClient.on("logOnResponse", async (response: any) => {
						if (response.eresult === EResult.OK) {
							steamFriends.setPersonaState(EPersonaState.Online)
							steamUser.gamesPlayed([
								{
									game_id: 570
								}
							])

							dota.on("ready", () => {
								resolve(dota)
							})

							dota.launch()
						} else {
							reject(
								new Error(`Login failed. Error code = ${response.eresult}`)
							)
						}
					})

					steamUser.logOn(logInDetails)
				} else {
					reject(err)
				}
			})

			steamClient.connect()
		} catch (e) {
			reject(e)
		}
	})
