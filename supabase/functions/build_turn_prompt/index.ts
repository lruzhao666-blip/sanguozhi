import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const { game_id, turn_number, player_actions } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse scene tags and generate dice rolls
    const allActionText = Object.values(player_actions).join(' ')
    const diceRolls = []
    const sceneTags = []

    function rollDice(count: number, sides: number) {
      const arr = new Uint32Array(count)
      crypto.getRandomValues(arr)
      return Array.from(arr).map(n => (n % sides) + 1)
    }

    if (allActionText.includes('攻打') || allActionText.includes('突袭')) {
      sceneTags.push('battle')
      diceRolls.push({
        desc: '战斗骰',
        attacker_rolls: rollDice(3, 6),
        defender_rolls: rollDice(3, 6),
        dice_type: 'battle'
      })
    }
    if (allActionText.includes('访贤') || allActionText.includes('寻访')) {
      sceneTags.push('recruit')
      diceRolls.push({
        desc: '情境骰 (访贤)',
        rolls: rollDice(2, 6),
        dice_type: 'situation'
      })
    }

    // Call extract_sentence_pack logic internally or invoke the other function
    // For simplicity, invoke it
    const { data: sentencePack, error: packErr } = await supabaseClient.functions.invoke('extract_sentence_pack', {
      body: { game_id, turn_number, scene_tags: sceneTags }
    })

    if (packErr) throw packErr

    // Generate prompt text
    const promptText = `
【本回合输入·第 ${turn_number} 回合】

═ 玩家行动 ═
甲:${player_actions.p0 || '无'}
乙:${player_actions.p1 || '无'}
丙:${player_actions.p2 || '无'}

═ 本回合预摇骰点 ═
${diceRolls.map(d => {
    if (d.attacker_rolls) {
        return `${d.desc}: 攻方 ${d.attacker_rolls.join('+')}=${d.attacker_rolls.reduce((a,b)=>a+b,0)} 守方 ${d.defender_rolls.join('+')}=${d.defender_rolls.reduce((a,b)=>a+b,0)}`;
    }
    return `${d.desc}: ${d.rolls.join('+')}=${d.rolls.reduce((a,b)=>a+b,0)}`;
}).join('\n')}

═ 本回合句式包 ═
${sentencePack ? JSON.stringify(sentencePack, null, 2) : '获取句式包失败，请走旧流程或稍后重试'}

═ 输出要求 ═
1. 严格遵循《GPT 主持人执行规则 v3.3》第三章标准回合输出模板
2. 单代码块包裹,36 等号分隔线
3. 仅在上述句式包内组合,每使用一条在数据区追加"句式△{ID}"
4. 骰点严格使用预摇值,不得自行编造
5. 新增锚点:剧情△、钩子△、声望△、句式△
`

    // Insert dice rolls into database
    if (diceRolls.length > 0) {
      await supabaseClient.from('dice_rolls').insert(diceRolls.map(d => ({
        game_id, turn_number, context: d.desc,
        attacker_rolls: d.attacker_rolls || null, defender_rolls: d.defender_rolls || null,
        dice_type: d.dice_type
      })))
    }

    return new Response(
      JSON.stringify({ prompt_text: promptText, dice_rolls: diceRolls, sentence_pack: sentencePack }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
