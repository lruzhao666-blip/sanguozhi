import json

def main():
    generals = [
        {
            "name": "成公英",
            "courtesy_name": "",
            "nickname": "",
            "faction_hint": "魏",
            "tier": "常规",
            "biography": "凉州金城人。先随韩遂，忠心耿耿，韩遂败亡后归降曹操，被委以重任。病逝于军中。",
            "suitable_roles": [
                "谋士",
                "副将",
                "不宜主导中原战事"
            ]
        },
        {
            "name": "邓义",
            "courtesy_name": "",
            "nickname": "",
            "faction_hint": "魏",
            "tier": "常规",
            "biography": "刘表部将。曹操平定荆州后归降，担任侍中。",
            "suitable_roles": [
                "内政从事",
                "文官",
                "不宜领兵作战"
            ]
        },
        {
            "name": "李通",
            "courtesy_name": "文达",
            "nickname": "",
            "faction_hint": "魏",
            "tier": "精英",
            "biography": "江夏平春人。早年聚众起事，后投曹操。官渡之战拒降袁绍，保卫许都。破关羽，病逝途中。",
            "suitable_roles": [
                "前线守将",
                "先锋",
                "不宜主理内政"
            ]
        }
    ]

    with open('tools/generals_batch03.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    data.extend(generals)

    with open('tools/generals_batch03.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
