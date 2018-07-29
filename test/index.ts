import * as dotenv from "dotenv"

dotenv.config()

import "mocha"
import { closeDb } from "@daas/db-adapter/src/connect"
// import {
// 	up as migrationsUp,
// 	down as migrationsDown
// } from "@daas/db-adapter/src/migrations"
// import { Bots } from "@daas/db-adapter"
// import testAllFunctions from "./functionsBot"
import testAllPick from "./testAllPick"

// const MINIMUM_BOTS = 10

before(async () => {
	process.env.NODE_ENV = "test"
// 	;["DATABASE_URL", "BOT_TEST_USERS"].forEach(it => {
// 		if (!process.env[it]) {
// 			throw new Error(`The env var ${it} is not defined!`)
// 		}
// 	})

// 	if (!process.env.DATABASE_URL!.includes("test")) {
// 		throw new Error(
// 			"The database name does not contain 'test'. The " +
// 				"test suite is refusing to run just so you don't accidentally " +
// 				"run this in the production database. " +
// 				"Make sure to include 'test' in the name of your test database."
// 		)
// 	}

// 	const bots = (() => {
// 		try {
// 			return JSON.parse(process.env.BOT_TEST_USERS!)
// 		} catch (e) {
// 			throw new Error("The env var BOT_TEST_USERS is not valid json!")
// 		}
// 	})()

// 	if (bots.length < MINIMUM_BOTS) {
// 		throw new Error(`You need to define at least ${MINIMUM_BOTS} bots!`)
// 	}

// 	await migrationsUp()

// 	await Promise.all(
// 		bots.map((it: any) =>
// 			Bots.insert({
// 				username: it.name,
// 				password: it.pass,
// 				sentryFile: null
// 			})
// 		)
// 	)
})

// describe("Test all Functions", () => testAllFunctions())
describe("Flow - All Pick", () => testAllPick())

after(async () => {
// 	await migrationsDown()
	await closeDb()
})
