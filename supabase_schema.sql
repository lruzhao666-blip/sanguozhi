-- Create tables described in the document
-- 【表一·games(对局表)】
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP DEFAULT now(),
    era TEXT,
    status TEXT,
    winner TEXT,
    players JSONB,
    strongholds JSONB,
    notes TEXT
);

-- 【表二·turns(回合表)】
CREATE TABLE turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    turn_number INT,
    created_at TIMESTAMP DEFAULT now(),
    raw_input TEXT,
    raw_output TEXT,
    parsed_data JSONB,
    snapshot JSONB,
    status TEXT
);

-- 【表三·player_states(玩家状态表)】
CREATE TABLE player_states (
    id UUID DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    turn_number INT,
    player_slot TEXT,
    name TEXT,
    gold INT,
    food INT,
    troops INT,
    morale INT,
    cities INT,
    reputation INT,
    PRIMARY KEY (game_id, turn_number, player_slot)
);

-- 【表四·cities(城池表)】
CREATE TABLE cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    turn_number INT,
    city_name TEXT,
    state_id TEXT,
    owner TEXT,
    geo_tags TEXT[],
    defenders TEXT[],
    troops JSONB,
    buffs JSONB
);

-- 【表五·generals(武将档案表)】
CREATE TABLE generals (
    id UUID DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    name TEXT,
    side TEXT,
    city TEXT,
    status TEXT,
    personality JSONB,
    bond INT,
    loyalty INT,
    PRIMARY KEY (game_id, name)
);

-- 【表六·battles(战报表)】
CREATE TABLE battles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    turn_number INT,
    attacker TEXT,
    defender TEXT,
    result TEXT,
    grade TEXT,
    attacker_loss INT,
    defender_loss INT,
    dice_record_id UUID
);

-- 【表七·sentence_library(句式库表)·核心】
CREATE TABLE sentence_library (
    id TEXT PRIMARY KEY,
    category TEXT,
    sub_category TEXT,
    breath TEXT,
    scene_tags TEXT[],
    structure TEXT,
    word_banks JSONB,
    examples JSONB,
    tone TEXT,
    warning TEXT,
    max_per_turn INT DEFAULT 1,
    window_size INT DEFAULT 10,
    window_max INT DEFAULT 3,
    created_at TIMESTAMP DEFAULT now(),
    active BOOLEAN
);

-- 【表八·sentence_usage(句式使用记录表)】
CREATE TABLE sentence_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    turn_number INT,
    sentence_id TEXT REFERENCES sentence_library(id),
    used_at TIMESTAMP DEFAULT now(),
    cooldown_until INT,
    cooldown_level INT
);

-- 【表九·dice_rolls(骰子记录表)】
CREATE TABLE dice_rolls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    turn_number INT,
    dice_type TEXT,
    dice_spec TEXT,
    attacker_rolls INT[],
    defender_rolls INT[],
    seed TEXT,
    created_at TIMESTAMP DEFAULT now(),
    context TEXT
);

-- 【表十·long_story_lines(长线剧情线表)】
CREATE TABLE long_story_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    title TEXT,
    stage INT,
    total_stages INT,
    status TEXT,
    last_advanced INT,
    notes TEXT
);

-- 【表十一·hooks(钩子表)】
CREATE TABLE hooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    turn_number INT,
    content TEXT,
    expires_at INT,
    status TEXT
);

-- 【表十二·admin_audit(管理员操作日志)】
CREATE TABLE admin_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id TEXT,
    action TEXT,
    target JSONB,
    before JSONB,
    after JSONB,
    created_at TIMESTAMP DEFAULT now(),
    reason TEXT
);

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
