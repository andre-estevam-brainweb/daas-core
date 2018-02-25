import * as Long from "long"
import { DOTA_GameState } from "./DOTA_GameState"
import { EMatchOutcome } from "./EMatchOutcome"

export interface CSODOTALobby {
	members: Array<any>
	left_members: Array<any>
	pending_invites: Array<any>
	team_details: Array<any>
	timed_reward_details: Array<any>
	broadcast_channel_info: Array<any>
	extra_messages: Array<any>
	previous_series_matches: Array<any>
	event_progression_enabled: Array<any>
	lobby_id: Long
	game_mode: number
	state: number
	leader_id: Long
	lobby_type: number
	allow_cheats: boolean
	fill_with_bots: boolean
	intro_mode: boolean
	game_name: string
	server_region: number
	cm_pick: number
	allow_spectating: boolean
	bot_difficulty_radiant: number
	bot_difficulty_dire: number
	game_version: number
	pass_key: string
	leagueid: number
	penalty_level_radiant: number
	penalty_level_dire: number
	series_type: number
	radiant_series_wins: number
	dire_series_wins: number
	allchat: boolean
	dota_tv_delay: number
	lan: boolean
	lan_host_ping_to_server_region: number
	visibility: number
	league_series_id: number
	league_game_id: number
	previous_match_override: Long
	pause_setting: number
	bot_radiant: Long
	bot_dire: Long
	selection_priority_rules: number
	match_id?: Long
	game_state?: DOTA_GameState
	match_outcome?: EMatchOutcome
}
