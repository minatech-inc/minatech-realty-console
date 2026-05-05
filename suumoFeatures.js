/**
 * SUUMO 特徴項目（特ピク）マスタ
 *
 * 規定書「特徴設備・選択キャッチ一覧」(2025.4更新) より抽出した約180項目
 *
 * 各項目:
 *   - id:        識別子
 *   - label:     ピクト名
 *   - category:  分類カテゴリ
 *   - applies:   適用可能な物件種別 (h=戸建, t=テラス, l=土地, m=マンション, tw=タウンハウス)
 *   - usedOnly:  中古物件専用フラグ
 *   - definition: 公式定義（簡略版）
 *   - autoJudge: 自動判定ロジック（任意）
 */
var SuumoFeatures = (function() {
    'use strict';

    var FEATURES = [
        // ===== 物件の性能 =====
        { id: 'cert_design',   label: '設計住宅性能評価書',   category: '物件の性能', applies: ['h','t','m','tw'] },
        { id: 'cert_long',     label: '長期優良住宅認定通知書', category: '物件の性能', applies: ['h','t','m','tw'] },
        { id: 'cert_seismic',  label: '耐震基準適合証明書',   category: '物件の性能', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'cert_built_new',label: '建設住宅性能評価書（新築時）', category: '物件の性能', applies: ['h','t','m','tw'] },
        { id: 'cert_built_used',label:'建設住宅性能評価書（既存住宅）', category: '物件の性能', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'cert_kakunin', label: '建築確認完了検査済証',  category: '物件の性能', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'cert_houkitsu',label: '法適合状況調査報告書',  category: '物件の性能', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'low_carbon',   label: '低炭素住宅',            category: '物件の性能', applies: ['h','t','m','tw'] },
        { id: 'bels',         label: 'BELS/省エネ基準適合認定書あり', category: '物件の性能', applies: ['h','m'] },
        { id: 'kashi_ins_use',  label: '瑕疵保険（国交省指定）保証利用可', category: '物件の性能', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'kashi_ins_paid', label: '瑕疵保険（国交省指定）保証付', category: '物件の性能', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'kashi_company',  label: '瑕疵保証付（不動産会社独自）', category: '物件の性能', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'flat35',         label: 'フラット35・S適合証明書', category: '物件の性能', applies: ['h','t','m','tw'] },

        // ===== 建物検査（インスペクション） =====
        { id: 'inspect_report', label: '建築士等の建物検査報告書', category: '建物検査', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'design_doc',     label: '新築時・増改築時の設計図', category: '住宅履歴', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'repair_record',  label: '修繕・点検の記録',         category: '住宅履歴', applies: ['h','t','m','tw'], usedOnly: true },

        // ===== 立地・土地特徴 =====
        { id: 'highground',    label: '高台に立地',         category: '立地', applies: ['h','t','m','l'] },
        { id: 'kukaku_seiri',  label: '区画整理地内',       category: '立地', applies: ['h','t','l'] },
        { id: 'seikei',        label: '整形地',             category: '立地', applies: ['h','t','l'] },
        { id: 'green_area',    label: '緑豊かな住宅地',     category: '立地', applies: ['h','t','l'] },
        { id: 'quiet_area',    label: '閑静な住宅地',       category: '立地', applies: ['h','t','l'] },
        { id: 'flat_land',     label: '平坦地',             category: '立地', applies: ['h','t','l'] },
        { id: 'no_front_bldg', label: '前面棟無',           category: '立地', applies: ['h','t','m','tw'] },
        { id: 'corner',        label: '角地',               category: '立地', applies: ['h','t','l'] },
        { id: 'large_town',    label: '大型タウン内',       category: '立地', applies: ['h','t','l'] },
        { id: 'resort',        label: '避暑地',             category: '立地', applies: ['h','t','l'] },
        { id: 'metro_suburb',  label: '都市近郊',           category: '立地', applies: ['h','t','l'] },
        { id: 'developed',     label: '開発分譲地内',       category: '立地', applies: ['h','t','l'] },
        { id: 'soil_checked',  label: '地盤調査済',         category: '立地', applies: ['h','t'] },
        { id: 'land_50tsubo',  label: '土地50坪以上',       category: '立地', applies: ['h','t','l'] },
        { id: 'land_100tsubo', label: '土地100坪以上',      category: '立地', applies: ['h','t','l'] },
        { id: 'south_road',    label: '南側道路面す',       category: '立地', applies: ['h','t','l'] },
        { id: 'road_6m',       label: '前道6m以上',         category: '立地', applies: ['h','t','l'] },
        { id: 'near_city',     label: '市街地が近い',       category: '立地', applies: ['h','t','l'] },

        // ===== 駅利便性 =====
        { id: 'station_flat',  label: '駅まで平坦',         category: '駅利便', applies: ['h','t','l','m','tw'] },
        { id: 'origin_station',label: '始発駅',             category: '駅利便', applies: ['h','t','l','m','tw'] },
        { id: 'multi_lines',   label: '2沿線以上利用可',    category: '駅利便', applies: ['h','t','l','m','tw'] },

        // ===== 住戸・階数 =====
        { id: 'highfloor',     label: '高層階',             category: '住戸・階数', applies: ['m'] },
        { id: 'corner_unit',   label: '角住戸',             category: '住戸・階数', applies: ['m','tw'] },
        { id: 'two_story',     label: '2階建',              category: '住戸・階数', applies: ['h','t'] },
        { id: 'three_story',   label: '3階建以上',          category: '住戸・階数', applies: ['h','t'] },
        { id: 'top_floor',     label: '最上階・上階なし',   category: '住戸・階数', applies: ['m'] },

        // ===== 陽当り・採光・通風 =====
        { id: 'south_facing',  label: '南向き',             category: '陽当り・採光', applies: ['h','t','m','tw'] },
        { id: 'all_south',     label: '全室南向き',         category: '陽当り・採光', applies: ['h','t','m','tw'] },
        { id: 'two_face_light',label: '全室2面採光',        category: '陽当り・採光', applies: ['h','t'] },
        { id: 'three_face_light',label: '3面採光',          category: '陽当り・採光', applies: ['h','t'] },
        { id: 'southeast_facing',label: '東南向き',         category: '陽当り・採光', applies: ['h','t','m','tw'] },
        { id: 'southwest_facing',label: '南西向き',         category: '陽当り・採光', applies: ['h','t','m','tw'] },
        { id: 'all_southeast', label: '全室東南向き',       category: '陽当り・採光', applies: ['h','t'] },
        { id: 'all_southwest', label: '全室南西向き',       category: '陽当り・採光', applies: ['h','t'] },
        { id: 'good_air',      label: '通風良好',           category: '陽当り・採光', applies: ['h','t'] },
        { id: 'good_sun',      label: '陽当り良好',         category: '陽当り・採光', applies: ['h','t','m','tw'] },

        // ===== 間取り =====
        { id: 'two_household', label: '2世帯住宅',          category: '間取り', applies: ['h','m'] },
        { id: 'atrium',        label: '吹抜け',             category: '間取り', applies: ['h','t'] },
        { id: 'partition',     label: '可動間仕切り',       category: '間取り', applies: ['h','t'] },
        { id: 'loft',          label: 'ロフト',             category: '間取り', applies: ['h','t'] },
        { id: 'ldk_15',        label: 'LDK15畳以上',        category: '間取り', applies: ['h','t','m','tw'] },
        { id: 'ldk_18',        label: 'LDK18畳以上',        category: '間取り', applies: ['h','t','m','tw'] },
        { id: 'ldk_20',        label: 'LDK20畳以上',        category: '間取り', applies: ['h','t','m','tw'] },
        { id: 'all_6jou',      label: '全居室6畳以上',      category: '間取り', applies: ['h','t','m','tw'] },
        { id: 'washitsu',      label: '和室',               category: '間取り', applies: ['h','t','m'] },

        // ===== 室内設備・仕様 =====
        { id: 'barrier_free',  label: 'バリアフリー',       category: '室内設備', applies: ['h','t','m'] },
        { id: 'high_ceiling',  label: '天井高2.5m以上',     category: '室内設備', applies: ['h','t'] },
        { id: 'floor_heat',    label: '床暖房',             category: '室内設備', applies: ['h','t','m','tw'] },
        { id: 'all_flooring',  label: '全居室フローリング', category: '室内設備', applies: ['h','t'] },
        { id: 'liv_stair',     label: 'リビング階段',       category: '室内設備', applies: ['h'] },
        { id: 'natural_mat',   label: '自然素材使用',       category: '室内設備', applies: ['h','t'] },
        { id: 'smart_key',     label: 'スマートキー',       category: '室内設備', applies: ['h','t'] },

        // ===== 収納 =====
        { id: 'walk_in_cl',    label: 'ウォークインクローゼット', category: '収納', applies: ['h','t','m','tw'] },
        { id: 'floor_storage', label: '床下収納',           category: '収納', applies: ['h','t'] },
        { id: 'all_room_st',   label: '全居室収納',         category: '収納', applies: ['h','t','m','tw'] },
        { id: 'nando',         label: '納戸',               category: '収納', applies: ['h','t'] },
        { id: 'attic_storage', label: '屋根裏収納',         category: '収納', applies: ['h'] },
        { id: 'shoe_in_cloak', label: 'シューズインクローク', category: '収納', applies: ['h','t','m','tw'] },

        // ===== キッチン =====
        { id: 'system_kitchen',label: 'システムキッチン',   category: 'キッチン', applies: ['h','t','m','tw'] },
        { id: 'open_kitchen',  label: '対面式キッチン',     category: 'キッチン', applies: ['h','t','m','tw'] },
        { id: 'dishwasher',    label: '食器洗乾燥機',       category: 'キッチン', applies: ['h','t','m','tw'] },
        { id: 'water_filter',  label: '浄水器',             category: 'キッチン', applies: ['h','t'] },
        { id: 'ih_cooker',     label: 'IHクッキングヒーター', category: 'キッチン', applies: ['h','t','m','tw'] },
        { id: 'island_kitchen',label: 'アイランドキッチン', category: 'キッチン', applies: ['h','t'] },
        { id: 'pantry',        label: 'パントリー',         category: 'キッチン', applies: ['h','t','m','tw'] },
        { id: 'disposer',      label: 'ディスポーザー',     category: 'キッチン', applies: ['h','t'] },

        // ===== 浴室 =====
        { id: 'bath_tv',       label: 'TV付浴室',           category: '浴室', applies: ['h','t'] },
        { id: 'jet_bath',      label: 'ジェットバス',       category: '浴室', applies: ['h','t'] },
        { id: 'auto_bath',     label: 'オートバス',         category: '浴室', applies: ['h','t'] },
        { id: 'bath_dryer',    label: '浴室乾燥機',         category: '浴室', applies: ['h','t','m','tw'] },
        { id: 'bath_1tsubo',   label: '浴室1坪以上',        category: '浴室', applies: ['h','t','m','tw'] },
        { id: 'bath_window',   label: '浴室に窓',           category: '浴室', applies: ['h','t','m'] },
        { id: 'mist_sauna',    label: 'ミストサウナ',       category: '浴室', applies: ['h','t'] },
        { id: 'audio_bath',    label: 'オーディオバス',     category: '浴室', applies: ['h','t'] },
        { id: 'rotenburo',     label: '露天風呂',           category: '浴室', applies: ['h','t'] },

        // ===== トイレ・洗面 =====
        { id: 'two_toilets',   label: 'トイレ2ヶ所',        category: 'トイレ', applies: ['h','t'] },
        { id: 'wash_toilet',   label: '温水洗浄便座',       category: 'トイレ', applies: ['h','t'] },
        { id: 'shower_basin',  label: 'シャワー付洗面化粧台', category: 'トイレ', applies: ['h','t'] },
        { id: 'tankless_toilet',label:'高機能トイレ',        category: 'トイレ', applies: ['h','t'] },
        { id: 'eco_toilet',    label: '節水型トイレ',       category: 'トイレ', applies: ['h','t'] },

        // ===== バルコニー・庭 =====
        { id: 'roof_balcony',  label: 'ルーフバルコニー',   category: 'バルコニー', applies: ['h','t','m','tw'] },
        { id: 'wood_deck',     label: 'ウッドデッキ',       category: 'バルコニー', applies: ['h','t','m'] },
        { id: 'terrace',       label: 'テラス',             category: 'バルコニー', applies: ['h','t','m'] },
        { id: 'wide_balcony',  label: 'ワイドバルコニー',   category: 'バルコニー', applies: ['h','t','m'] },
        { id: 'south_balcony', label: '南面バルコニー',     category: 'バルコニー', applies: ['h','t','m','tw'] },
        { id: 'multi_balcony', label: '2面以上バルコニー', category: 'バルコニー', applies: ['h','t'] },
        { id: 'balcony_water', label: 'バルコニー・屋上に水栓あり', category: 'バルコニー', applies: ['h','t'] },
        { id: 'private_garden',label: '専用庭',             category: '庭', applies: ['m','tw'] },
        { id: 'south_garden',  label: '南庭',               category: '庭', applies: ['h','t','m'] },
        { id: 'garden',        label: '庭',                 category: '庭', applies: ['h'] },
        { id: 'garden_10tsubo',label: '庭10坪以上',         category: '庭', applies: ['h','t'] },

        // ===== エコ関連 =====
        { id: 'energy_save',   label: '省エネルギー対策',   category: 'エコ', applies: ['h','t'] },
        { id: 'high_insulation',label: '高気密高断熱住宅', category: 'エコ', applies: ['h','t'] },
        { id: 'all_electric',  label: 'オール電化',         category: 'エコ', applies: ['h','t','m','tw'] },
        { id: 'solar_power',   label: '太陽光発電システム', category: 'エコ', applies: ['h'] },
        { id: 'pair_glass',    label: '複層ガラス',         category: 'エコ', applies: ['h','t'] },
        { id: 'eco_water_heater',label: '省エネ給湯器',     category: 'エコ', applies: ['h','t','m','tw'] },
        { id: 'all_pair_glass',label: '全居室複層ガラスか複層サッシ', category: 'エコ', applies: ['h','t'] },

        // ===== テレビ・通信 =====
        { id: 'fast_internet', label: '高速ネット対応',     category: '通信', applies: ['h','t','m'] },
        { id: 'bs_cs_catv',    label: 'BS・CS・CATV',       category: '通信', applies: ['h','t','m'] },

        // ===== 駐車・駐輪 =====
        { id: 'self_parking',  label: '自走式駐車場',       category: '駐車', applies: ['m'] },
        { id: 'flat_parking',  label: '平面駐車場',         category: '駐車', applies: ['m'] },
        { id: 'parking_2',     label: '駐車2台可',          category: '駐車', applies: ['h','t','m'] },
        { id: 'builtin_garage',label: 'ビルトインガレージ', category: '駐車', applies: ['h'] },
        { id: 'shutter_garage',label: 'シャッター車庫',     category: '駐車', applies: ['h'] },
        { id: 'parking_3',     label: '駐車3台以上可',      category: '駐車', applies: ['h','t'] },
        { id: 'highroof_park_avail',label: 'ハイルーフ駐車場空きあり', category: '駐車', applies: ['m'] },
        { id: 'highroof_park', label: 'ハイルーフ駐車場',   category: '駐車', applies: ['m'] },
        { id: 'ev_charge',     label: 'EV車充電設備',       category: '駐車', applies: ['h','m'] },
        { id: 'bike_parking',  label: 'バイク置場',         category: '駐車', applies: ['m'] },
        { id: 'bicycle_parking',label: '駐輪場',            category: '駐車', applies: ['m'] },

        // ===== 共用部 =====
        { id: 'delivery_box',  label: '宅配ボックス',       category: '共用部', applies: ['m'] },
        { id: 'elevator',      label: 'エレベーター',       category: '共用部', applies: ['m'] },
        { id: 'garbage_24h',   label: '24時間ゴミ出し可',   category: '共用部', applies: ['m'] },
        { id: 'pool',          label: 'プール',             category: '共用部', applies: ['h','t','m'] },
        { id: 'rotenburo_share',label:'共用露天風呂',       category: '共用部', applies: ['h','t','m'] },
        { id: 'shared_amenity',label: '共有施設充実',       category: '共用部', applies: ['m'] },
        { id: 'kids_room',     label: 'キッズルーム・託児所', category: '共用部', applies: ['m'] },
        { id: 'guest_room',    label: 'ゲストルーム',       category: '共用部', applies: ['m'] },

        // ===== 管理・セキュリティ =====
        { id: 'mgr_24h',       label: '24時間有人管理',     category: '管理', applies: ['h','t','m','tw'] },
        { id: 'tv_intercom',   label: 'TVモニタ付インターホン', category: '管理', applies: ['h','t','m'] },
        { id: 'security',      label: 'セキュリティ充実',   category: '管理', applies: ['h','t','m','l','tw'] },

        // ===== リフォーム・リノベーション =====
        { id: 'refloor',       label: 'フローリング張替',   category: 'リフォーム', applies: ['h','t','m','tw'] },
        { id: 'renovation',    label: 'リノベーション',     category: 'リフォーム', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'cert_renovation',label:'適合リノベーション', category: 'リフォーム', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'refurb_in',     label: '内装リフォーム',     category: 'リフォーム', applies: ['h','t','m','tw'], usedOnly: true },
        { id: 'refurb_out',    label: '外装リフォーム',     category: 'リフォーム', applies: ['h','t','m'], usedOnly: true },
        { id: 'refurb_full',   label: '内外装リフォーム',   category: 'リフォーム', applies: ['h','t','m','tw'], usedOnly: true },

        // ===== 周辺環境 =====
        { id: 'wide_neighbor', label: '隣家との間隔が大きい', category: '周辺', applies: ['h'] },
        { id: 'low_traffic',   label: '周辺交通量少なめ',   category: '周辺', applies: ['h','t','m','l'] },
        { id: 'sidewalk',      label: '整備された歩道',     category: '周辺', applies: ['h','t','m','l'] },
        { id: 'near_golf',     label: 'ゴルフ場が近い',     category: '周辺', applies: ['h','t','l'] },
        { id: 'near_ski',      label: 'スキー場が近い',     category: '周辺', applies: ['h','t','l'] },
        { id: 'near_tennis',   label: 'テニスコートが近い', category: '周辺', applies: ['h','t','l'] },
        { id: 'near_super',    label: 'スーパー徒歩10分以内', category: '周辺', applies: ['h','t','l','m','tw'] },
        { id: 'near_hospital', label: '総合病院徒歩10分以内', category: '周辺', applies: ['h','t','l','m','tw'] },
        { id: 'near_school',   label: '小学校徒歩10分以内', category: '周辺', applies: ['h','t','l','m','tw'] },

        // ===== 眺望・自然環境 =====
        { id: 'oceanview',     label: 'オーシャンビュー',   category: '眺望', applies: ['h','t','m'] },
        { id: 'sea_2km',       label: '海まで2km以内',      category: '眺望', applies: ['h','t','m'] },
        { id: 'riverside',     label: 'リバーサイド',       category: '眺望', applies: ['h','t','m'] },
        { id: 'rural',         label: '田園風景',           category: '眺望', applies: ['h','t','m'] },
        { id: 'fireworks',     label: '花火大会鑑賞',       category: '眺望', applies: ['h','t','m'] },
        { id: 'good_view',     label: '眺望良好',           category: '眺望', applies: ['h','t','m'] },
        { id: 'lake_view',     label: '湖・池が見える',     category: '眺望', applies: ['h','t','m'] },
        { id: 'mountain_view', label: '山が見える',         category: '眺望', applies: ['h','t','m'] },

        // ===== 費用・引き渡し ====
        { id: 'immediate',     label: '即引渡可',           category: '引渡', applies: ['h','t','m','tw'] },
        { id: 'this_year',     label: '年度内引渡可',       category: '引渡', applies: ['h','t'] },
        { id: 'within_year',   label: '年内引渡可',         category: '引渡', applies: ['h','t'] },
        { id: 'pet_ok',        label: 'ペット相談',         category: '引渡', applies: ['m','tw'] },
        { id: 'imm_handover',  label: '即引渡し可',         category: '引渡', applies: ['l'] },
        { id: 'no_construct',  label: '建築条件なし',       category: '引渡', applies: ['l'] },
        { id: 'vacant_handover',label:'更地渡し',           category: '引渡', applies: ['l'] },
        { id: 'building_plan', label: '建物プラン例有り',   category: '引渡', applies: ['l'] },
        { id: 'flat35_compat', label: 'フラット35Sに対応',  category: '引渡', applies: ['h','t'] },
        { id: 'akiya_bank',    label: '空き家バンク登録物件', category: '引渡', applies: ['h','t'] },

        // ===== その他 =====
        { id: 'onsen',         label: '温泉付',             category: 'その他', applies: ['h','t','m'] },
        { id: 'log_house',     label: 'ログハウス',         category: 'その他', applies: ['h'] },
        { id: 'onsen_avail',   label: '温泉引き込み可',     category: 'その他', applies: ['h','t'] },
        { id: 'kominka',       label: '古民家風',           category: 'その他', applies: ['h'] },
        { id: 'onsen_right',   label: '温泉権利付き',       category: 'その他', applies: ['l'] },
        { id: 'home_garden',   label: '家庭菜園',           category: 'その他', applies: ['h','t','l'] },
        { id: 'farm',          label: '畑',                 category: 'その他', applies: ['h'] },
        { id: 'roof_top',      label: '屋上',               category: 'その他', applies: ['h','t'] },
        { id: 'urban_gas',     label: '都市ガス',           category: 'その他', applies: ['h','t','m','l'] },
        { id: 'snow_melt',     label: '融雪対策',           category: 'その他', applies: ['h','t'] }
    ];

    // 物件種別コードに対応する features をフィルタ
    function listFor(propType, isUsed) {
        var typeCode = (propType || 'house').toLowerCase();
        var typeMap = { 'house':'h', 'terrace':'t', 'land':'l', 'mansion':'m', 'townhouse':'tw' };
        var c = typeMap[typeCode] || 'h';
        return FEATURES.filter(function(f) {
            if (f.applies.indexOf(c) < 0) return false;
            if (f.usedOnly && !isUsed) return false;
            return true;
        });
    }

    // カテゴリ別にグループ化
    function groupByCategory(features) {
        var groups = {};
        features.forEach(function(f) {
            if (!groups[f.category]) groups[f.category] = [];
            groups[f.category].push(f);
        });
        return groups;
    }

    function findById(id) {
        for (var i = 0; i < FEATURES.length; i++) {
            if (FEATURES[i].id === id) return FEATURES[i];
        }
        return null;
    }

    return {
        FEATURES: FEATURES,
        listFor: listFor,
        groupByCategory: groupByCategory,
        findById: findById
    };
})();
