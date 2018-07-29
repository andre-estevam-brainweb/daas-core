import * as dotenv from "dotenv"

dotenv.config()

import "mocha"
import { closeDb } from "@daas/db-adapter/src/connect"
import {
	up as migrationsUp,
	down as migrationsDown
} from "@daas/db-adapter/src/migrations"
import { Bots } from "@daas/db-adapter"
import { testSuite } from "./suite"

const MINIMUM_BOTS = 5

before(async () => {
	process.env.NODE_ENV = "test"
	;["DATABASE_URL", "BOT_TEST_USERS"].forEach(it => {
		if (!process.env[it]) {
			throw new Error(`The env var ${it} is not defined!`)
		}
	})

	const bots = (() => {
		try {
			return JSON.parse(process.env.BOT_TEST_USERS!)
		} catch (e) {
			throw new Error("The env var BOT_TEST_USERS is not valid json!")
		}
	})()

	if (bots.length < MINIMUM_BOTS) {
		throw new Error(`You need to define at least ${MINIMUM_BOTS} bots!`)
	}

  // await migrationsDown()
	await migrationsUp()

	await Promise.all(
		bots.map((it: any) =>
			Bots.insert({
				username: it.name,
				password: it.pass,
				sentryFile: null
			})
		)
	)
})

describe("DaaS Core", () => testSuite())

after(async () => {
	await migrationsDown()
	await closeDb()
})
