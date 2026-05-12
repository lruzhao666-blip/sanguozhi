
-- report_sentence_usage RPC
CREATE OR REPLACE FUNCTION report_sentence_usage(p_game_id UUID, p_turn_number INT, p_sentence_ids TEXT[])
RETURNS VOID AS $$
DECLARE
    sid TEXT;
BEGIN
    FOREACH sid IN ARRAY p_sentence_ids
    LOOP
        INSERT INTO sentence_usage (game_id, turn_number, sentence_id, cooldown_until, cooldown_level)
        VALUES (p_game_id, p_turn_number, sid, p_turn_number + 8, 1);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- commit_turn RPC
CREATE OR REPLACE FUNCTION commit_turn(p_game_id UUID, p_turn_number INT, p_parsed_data JSONB, p_raw_output TEXT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO turns (game_id, turn_number, parsed_data, raw_output, status)
    VALUES (p_game_id, p_turn_number, p_parsed_data, p_raw_output, 'committed');
END;
$$ LANGUAGE plpgsql;

-- adjust_resource RPC
CREATE OR REPLACE FUNCTION adjust_resource(p_game_id UUID, p_player_slot TEXT, p_resource_type TEXT, p_delta INT, p_reason TEXT)
RETURNS VOID AS $$
BEGIN
    -- Dummy logic for resource adjustment for now
    INSERT INTO admin_audit (admin_id, action, target, reason)
    VALUES ('admin', 'resource_adjust', jsonb_build_object('player', p_player_slot, 'resource', p_resource_type, 'delta', p_delta), p_reason);
END;
$$ LANGUAGE plpgsql;

-- rollback_to_turn RPC
CREATE OR REPLACE FUNCTION rollback_to_turn(p_game_id UUID, p_target_turn INT)
RETURNS VOID AS $$
BEGIN
    -- Dummy logic for rollback
    UPDATE turns SET status = 'rolled_back' WHERE game_id = p_game_id AND turn_number > p_target_turn;
END;
$$ LANGUAGE plpgsql;
