import { Bot } from "@daas/model"
const steam = require("steam")
const { Dota2Client } = require("dota2")
import getListOfServers from './getSteamServers';

export const getDotaClient = (bot: Bot) =>
	new Promise<any>(async (resolve, reject) => {
		try {
			const servers = await getListOfServers()

			console.log(`Server list is null`, servers?'no':'yes')

			steam.servers = servers || steam.servers

			const steamClient = new steam.SteamClient()
			const steamUser = new steam.SteamUser(steamClient)
			const steamFriends = new steam.SteamFriends(steamClient)
			const dota = new Dota2Client(steamClient, true, true)//TODO: steamClient, place false, false for disabling debug mode

			steamClient.on("error", (err: any) => {
				console.error(`An error happened while trying to connect to steam: `, err)
				reject(err)
			})

			steamClient.on("connected", (err: any) => {
				console.log('Steam client is connected')
				if (!err) {
					const logInDetails = {} as any

					logInDetails.account_name = bot.username
					logInDetails.password = bot.password

					if (bot.sentryFile) {
						logInDetails.sha_sentryfile = bot.sentryFile
					}

					console.log('Will try to signin with credentials: ', logInDetails)

					steamClient.on("logOnResponse", async (response: any) => {
						if (response.eresult === steam.EResult.OK) {
							console.log(`${logInDetails.account_name} => Setting bot with ONLINE state at steam`)
							steamFriends.setPersonaState(steam.EPersonaState.Online)

							steamUser.gamesPlayed([
								{
									game_id: 570
								}
							])

							console.log(`${logInDetails.account_name} => Waiting for DOTA ready signal`)
							
							dota.on("ready", () => {
								resolve(dota)
							})
							console.log(`${logInDetails.account_name} => launching DOTA`)
							dota.launch()
						} else {
							console.error(`${logInDetails.account_name} => An error happened while trying to connect to steam | 
							dota error code: `, response.eresult)
							reject(
								new Error(`${logInDetails.account_name} => Login failed. Error code = ${response.eresult}`)
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
