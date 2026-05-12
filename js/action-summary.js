/**
 * action-summary.js - 玩家行动汇总与Prompt生成
 */
import { supabase } from './supabase-client.js';

window.ActionSummary = (function() {

    // 简单的摇骰子函数
    function rollDice(count, sides) {
      const arr = new Uint32Array(count);
      crypto.getRandomValues(arr);
      return Array.from(arr).map(n => (n % sides) + 1);
    }

    async function generatePrompt() {
        const turnNumber = parseInt(document.getElementById('current-turn-number')?.innerText || '1');
        const gameId = window.currentGameId || '00000000-0000-0000-0000-000000000000';

        const actions = {
            p0: document.getElementById('action-p0').value,
            p1: document.getElementById('action-p1').value,
            p2: document.getElementById('action-p2').value
        };

        let promptText = '';
        let diceRolls = [];

        try {
            const { data, error } = await supabase.functions.invoke('build_turn_prompt', {
                body: { game_id: gameId, turn_number: turnNumber, player_actions: actions }
            });

            if (!error && data) {
                promptText = data.prompt_text;
                diceRolls = data.dice_rolls || [];
                window.lastSentencePack = data.sentence_pack;
                window.lastDiceRolls = diceRolls;
            } else {
                console.error("Failed to build turn prompt:", error);
                promptText = "获取句式包失败，请走旧流程或稍后重试";
            }
        } catch (e) {
            console.error("Failed to build turn prompt:", e);
            promptText = "获取句式包失败，请走旧流程或稍后重试";
        }

        // 渲染到UI
        document.getElementById('prompt-output').innerText = promptText;
        document.getElementById('prompt-output-container').classList.remove('hidden');

        // Populate #dice-roller-content in the UI
        const diceBlock = document.getElementById('dice-roller-block');
        const diceContent = document.getElementById('dice-roller-content');
        if (diceRolls.length > 0 && diceBlock && diceContent) {
            diceBlock.classList.remove('hidden');
            diceContent.innerHTML = diceRolls.map(d => {
                if (d.attacker_rolls) {
                    return `<div class="dice-group">
                                <div class="dice-title">${d.desc}</div>
                                <div>攻方: <span class="dice-result flashing">🎲 [${d.attacker_rolls.join(',')}] = ${d.attacker_rolls.reduce((a,b)=>a+b,0)}</span></div>
                                <div>守方: <span class="dice-result flashing">🎲 [${d.defender_rolls.join(',')}] = ${d.defender_rolls.reduce((a,b)=>a+b,0)}</span></div>
                            </div>`;
                } else {
                    return `<div class="dice-group">
                                <div class="dice-title">${d.desc}</div>
                                <div><span class="dice-result flashing">🎲 [${d.rolls.join(',')}] = ${d.rolls.reduce((a,b)=>a+b,0)}</span></div>
                            </div>`;
                }
            }).join('');

            // Remove flashing class after animation completes
            setTimeout(() => {
                document.querySelectorAll('.dice-result').forEach(el => el.classList.remove('flashing'));
            }, 500);
        } else if (diceBlock) {
            diceBlock.classList.add('hidden');
            diceContent.innerHTML = '';
        }
    }

    return {
        generatePrompt
    }

})();
