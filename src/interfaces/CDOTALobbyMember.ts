import * as Long from "long"
import { LobbyMemberTeam } from "../enums/LobbyMemberTeam"

export interface CDOTALobbyMember {
	id: Long
	disabled_hero_id: Array<any>
	enabled_hero_id: Array<any>
	xp_bonuses: Array<any>
	custom_game_product_ids: Array<any>
	team: LobbyMemberTeam
	name: string
	slot: number
	leaver_status: number
	channel: number
	partner_account_type: number
	coach_team: number
	cameraman: boolean
	favorite_team_packed: Long
	is_prime_subscriber: boolean
}
