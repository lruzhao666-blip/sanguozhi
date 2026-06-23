import json

def main():
    generals = [
        {
            "name": "张先",
            "courtesy_name": "",
            "nickname": "",
            "faction_hint": "群雄",
            "tier": "常规",
            "biography": "张绣部将。随张绣对抗曹操，勇武过人。",
            "suitable_roles": [
                "副将",
                "先锋"
            ]
        },
        {
            "name": "柳毅",
            "courtesy_name": "",
            "nickname": "",
            "faction_hint": "群雄",
            "tier": "常规",
            "biography": "公孙度部将。曾奉命越海渡过渤海攻打青州东莱郡，颇有战功。",
            "suitable_roles": [
                "前线守将",
                "水军统领"
            ]
        },
        {
            "name": "公孙康",
            "courtesy_name": "",
            "nickname": "",
            "faction_hint": "群雄",
            "tier": "常规",
            "biography": "辽东太守公孙度之子。继承父业，割据辽东。斩杀袁尚、袁熙首级献给曹操，大破高句丽。",
            "suitable_roles": [
                "割据势力",
                "一方诸侯"
            ]
        },
        {
            "name": "公孙恭",
            "courtesy_name": "",
            "nickname": "",
            "faction_hint": "群雄",
            "tier": "常规",
            "biography": "公孙度之子，公孙康之弟。公孙康死后，因其子公孙渊年幼，由公孙恭继任辽东太守，后被公孙渊夺权。",
            "suitable_roles": [
                "内政从事",
                "守成之主"
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
