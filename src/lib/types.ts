//src\lib\types.ts
export type UUID = string;
export type JsonRecord = Record<string, unknown>;

export type Profile = { id: UUID; email?: string | null; full_name?: string | null; role?: string | null; created_at?: string | null };
export type Team = { id: UUID; name: string; code?: string | null; flag_url?: string | null; group_name?: string | null; created_at?: string | null };
export type Player = { id: UUID; team_id: UUID | null; name: string; position?: string | null; jersey_number?: number | null; is_active?: boolean | null; teams?: Team | null };
export type Match = { id: UUID; team_a_id: UUID | null; team_b_id: UUID | null; match_start_at: string; stage?: string | null; status?: string | null; team_a_score?: number | null; team_b_score?: number | null; finalized_at?: string | null; teams_a?: Team | null; teams_b?: Team | null };
export type MatchGoal = { id: UUID; match_id: UUID; player_id: UUID | null; team_id?: UUID | null; minute?: number | null; own_goal?: boolean | null; players?: Player | null; teams?: Team | null };
export type SponsorBanner = { id: UUID; title: string; image_url: string; target_url?: string | null; is_active?: boolean | null; sort_order?: number | null; created_at?: string | null };
export type Winner = { id: UUID; profile_id?: UUID | null; match_id?: UUID | null; prize_title?: string | null; is_published?: boolean | null; created_at?: string | null; profiles?: Profile | null; matches?: Match | null };
export type LeaderboardRow = { user_id?: UUID; profile_id?: UUID; full_name?: string | null; email?: string | null; total_points?: number | null; correct_scores?: number | null; correct_scorers?: number | null; rank?: number | null; [key: string]: unknown };
