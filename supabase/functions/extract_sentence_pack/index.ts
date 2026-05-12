import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const { game_id, turn_number, scene_tags } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: allSentences, error: libErr } = await supabaseClient
      .from('sentence_library')
      .select('*')
      .eq('active', true)

    if (libErr) throw libErr

    const { data: usageRecords, error: usageErr } = await supabaseClient
      .from('sentence_usage')
      .select('sentence_id')
      .eq('game_id', game_id)
      .gte('cooldown_until', turn_number)

    if (usageErr) throw usageErr

    const cooldownIds = usageRecords.map(r => r.sentence_id)
    const availableSentences = allSentences.filter(s => !cooldownIds.includes(s.id))

    // 获取使用频次 (简化起见从数据库直接统计所有频次，实际中可结合 window_size 进行更细粒度的控制)
    const { data: allUsages, error: allUsageErr } = await supabaseClient
      .from('sentence_usage')
      .select('sentence_id')
      .eq('game_id', game_id)

    if (allUsageErr) throw allUsageErr

    const usageCountMap: Record<string, number> = {}
    allUsages.forEach(u => {
        usageCountMap[u.sentence_id] = (usageCountMap[u.sentence_id] || 0) + 1
    })

    const getByCategory = (category: string, limit: number) => {
        let pool = availableSentences.filter(s => s.category === category)

        // 加权随机: weight = 1 / (该句式累计使用次数 + 1)
        const weightedPool = pool.map(s => {
            const usage = usageCountMap[s.id] || 0
            return { s, weight: 1 / (usage + 1) }
        })

        const selectWeighted = () => {
            let totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0)
            let random = Math.random() * totalWeight
            for (let i = 0; i < weightedPool.length; i++) {
                random -= weightedPool[i].weight
                if (random <= 0) {
                    const selected = weightedPool.splice(i, 1)[0].s
                    return selected
                }
            }
            return weightedPool.length > 0 ? weightedPool.splice(0, 1)[0].s : null
        }

        const selectedList = []
        while (selectedList.length < limit && weightedPool.length > 0) {
            const selected = selectWeighted()
            if (selected) selectedList.push(selected)
        }

        return selectedList.map(s => ({
            id: s.id,
            structure: s.structure,
            word_banks: s.word_banks,
            examples: s.examples,
            tone: s.tone,
            warning: s.warning
        }))
    }

    const result = {
      ambience: getByCategory('氛围开头', 5),
      incision: { primary: "物件", forbidden: ["人物"], pool: getByCategory('切口起笔', 8) },
      actions: getByCategory('小动作', 10),
      metaphors: getByCategory('比喻', 5),
      general_entry: getByCategory('出场', 8),
      micro: getByCategory('微型骨架', 5),
      blacklist: cooldownIds,
      expires_at_turn: turn_number + 1
    }

    return new Response(
      JSON.stringify(result),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
