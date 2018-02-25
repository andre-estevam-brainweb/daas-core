// Source: https://github.com/Arcana/node-dota2/blob/31e823811667f4a5308d684659bdfc7ce9a171a2/proto/dota_shared_enums.proto#L315-L324
export enum EMatchOutcome {
	k_EMatchOutcome_Unknown = 0,
	k_EMatchOutcome_RadVictory = 2,
	k_EMatchOutcome_DireVictory = 3,
	k_EMatchOutcome_NotScored_PoorNetworkConditions = 64,
	k_EMatchOutcome_NotScored_Leaver = 65,
	k_EMatchOutcome_NotScored_ServerCrash = 66,
	k_EMatchOutcome_NotScored_NeverStarted = 67,
	k_EMatchOutcome_NotScored_Canceled = 68
}
