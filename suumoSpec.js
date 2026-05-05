/**
 * SUUMO 入稿仕様マスタ（2025.4 規定書ベース）
 *
 * - 物件種別/建物状況/分譲形態/取引態様/構造/権利/地目 等の選択肢
 * - 必須項目マトリクス（物件種別×販売戸数）
 * - キャッチコメント禁止用語/根拠必要用語
 * - 価格表記制約
 *
 * 参考: SUUMO売買 掲載規定書 2025.12.23 / 特徴設備・選択キャッチ一覧 2025.4
 */
var SuumoSpec = (function() {
    'use strict';

    // ======== 物件種別 ========
    var PROPERTY_TYPES = {
        'house':     { code: 'house',     label: '戸建',           form: 'house', tab: 'kodate' },
        'terrace':   { code: 'terrace',   label: 'テラスハウス',   form: 'house', tab: 'kodate' },
        'land':      { code: 'land',      label: '土地',           form: 'land',  tab: 'tochi' },
        'mansion':   { code: 'mansion',   label: 'マンション',     form: 'mansion', tab: 'mansion' },
        'townhouse': { code: 'townhouse', label: 'タウンハウス',   form: 'mansion', tab: 'mansion' }
    };

    // ======== 建物状況 ========
    var BUILDING_STATUS = {
        'new':      { code: 'new',      label: '新築',   def: '建築後1年未満かつ未入居', tab: 'shinchiku' },
        'unlived':  { code: 'unlived',  label: '未入居', def: '建築後1年以上かつ未入居', tab: 'shinchiku' },
        'used':     { code: 'used',     label: '中古',   def: '建築後1年以上または入居歴あり', tab: 'chuko' }
    };

    // ======== 分譲形態（販売状態） ========
    var SALES_STATUS = {
        'reserved': { code: 'reserved', label: '販売予定', def: '価格・諸費用未定（予告広告）' },
        'new':      { code: 'new',      label: '新規分譲', def: '価格・諸費用確定、販売開始日が未来' },
        'selling':  { code: 'selling',  label: '分譲中',   def: '販売開始済' }
    };

    // ======== 取引態様 ========
    var TRADE_PARTIES = {
        'seller':            { code: 'seller',            label: '売主' },
        'agent_exclusive':   { code: 'agent_exclusive',   label: '販売提携(代理)' },
        'agent_subexclusive':{ code: 'agent_subexclusive',label: '販売提携(復代理)' },
        'mediation_general': { code: 'mediation_general', label: '仲介(一般媒介)' },
        'mediation_specific':{ code: 'mediation_specific',label: '仲介(専任媒介)' },
        'mediation_full':    { code: 'mediation_full',    label: '仲介(専属専任)' },
        'agent_promo':       { code: 'agent_promo',       label: '販売提携(媒介)' }
    };

    // ======== 構造 ========
    var STRUCTURES = {
        'rc':         { code: 'rc',         label: 'RC造' },
        'src':        { code: 'src',        label: 'SRC造' },
        'wood':       { code: 'wood',       label: '木造' },
        'steel':      { code: 'steel',      label: '鉄骨造' },
        'lightsteel': { code: 'lightsteel', label: '軽量鉄骨造' },
        'pc':         { code: 'pc',         label: 'PC造' },
        'hpc':        { code: 'hpc',        label: 'HPC造' },
        'alc':        { code: 'alc',        label: 'ALC造' }
    };

    // ======== 工法（戸建用） ========
    var CONSTRUCTION_METHODS = [
        '2×4工法', '2×6工法', '軸組工法', 'プレハブ工法', 'パネル工法',
        'ユニット工法', 'SE工法', 'SW工法', 'FP工法', 'GL工法', 'SPR工法'
    ];

    // ======== 用途地域（13種） ========
    var USE_ZONES = [
        '第一種低層住居専用地域', '第二種低層住居専用地域',
        '第一種中高層住居専用地域', '第二種中高層住居専用地域',
        '第一種住居地域', '第二種住居地域', '準住居地域',
        '近隣商業地域', '商業地域', '準工業地域', '工業地域', '工業専用地域',
        '田園住居地域'
    ];

    // ======== 敷地権利 ========
    var LAND_RIGHTS = {
        'ownership':         { code: 'ownership',         label: '所有権' },
        'leasehold':         { code: 'leasehold',         label: '借地権' },
        'mixed':             { code: 'mixed',             label: '所有権・借地権混在' }
    };

    // ======== 借地権種別 ========
    var LEASEHOLD_TYPES = [
        '旧法賃借権', '旧法地上権', '普通賃借権', '普通地上権',
        '一般定期賃借権', '一般定期地上権',
        '建物譲渡特約付き定期賃借権', '建物譲渡特約付き定期地上権'
    ];

    // ======== 地目 ========
    var JIMOKU = [
        '宅地', '田', '畑', '山林', '原野', '雑種地',
        '塩田', '鉱泉地', '牧場', '墓地', '境内地', '運河用地',
        '堤', '池沼', '水道用地', '用悪水路', 'ため池', '井溝',
        '保安林', '公衆用道路', '公園', '学校用地', '鉄道用地'
    ];

    // ======== 上水道 ========
    var WATER_SUPPLY = ['公営水道', '私設水道', '井戸'];
    // ======== 下水道 ========
    var SEWERAGE = ['本下水', '集中浄化槽', '個別浄化槽'];
    // ======== ガス ========
    var GAS = ['都市ガス', '集中LPG', '個別LPG', 'オール電化'];

    // ======== 土地状況 ========
    var LAND_STATUS = {
        'undeveloped':  { code: 'undeveloped',  label: '未造成' },
        'with_old':     { code: 'with_old',     label: '古家あり' },
        'with_old_demo':{ code: 'with_old_demo',label: '古家あり更地渡し' },
        'vacant':       { code: 'vacant',       label: '更地' }
    };

    // ======== 管理形態 ========
    var MANAGEMENT_FORM = ['委託', '一部委託', '自主管理'];
    // ======== 管理員 ========
    var MANAGEMENT_STAFF = ['常駐', '通勤', '巡回', '管理員なし', '勤務形態未定'];

    // ======== 駐車場タイプ ========
    var PARKING_TYPES = ['車庫', '地下車庫', 'カーポート', 'カースペース', '無', '空無'];

    // ======== 必須項目マトリクス（物件種別×販売戸数） ========
    // 凡例: REQUIRED=必須, COND=条件付必須, OPT=任意, NA=該当なし
    var REQUIRED_FIELDS = {
        // 共通必須（全物件種別）
        common: [
            { key: '所在地',         label: '物件所在地（市区町村+町名+地番または住居表示）' },
            { key: '価格',           label: '販売価格（万円）' },
            { key: '取引態様',       label: '取引態様' },
            { key: '広告主社名',     label: '広告主の正式社名（法人格付き）' },
            { key: '広告主免許番号', label: '広告主の宅建免許番号' },
            { key: '取引条件有効期限', label: '取引条件有効期限' }
        ],
        // 戸建/テラスハウス
        house: [
            { key: '土地面積',     label: '土地面積（㎡）' },
            { key: '建物面積',     label: '建物面積（㎡）' },
            { key: '間取り',       label: '間取りタイプ' },
            { key: '築年月',       label: '築年月（中古は必須）', condition: 'used' },
            { key: '構造',         label: '構造' },
            { key: '完成時期',     label: '完成時期 or 完成予定時期' },
            { key: '引渡可能時期', label: '引渡可能時期' },
            { key: '前面道路',     label: '前面道路（向き・幅員・接道幅）' },
            { key: '私道負担',     label: '私道負担（含む場合）' },
            { key: '用途地域',     label: '用途地域' },
            { key: '建ぺい率',     label: '建ぺい率（%）' },
            { key: '容積率',       label: '容積率（%）' },
            { key: '地目',         label: '地目' },
            { key: '敷地権利',     label: '敷地の権利' },
            { key: '上水道',       label: '上水道' },
            { key: '下水道',       label: '下水道' },
            { key: 'ガス',         label: 'ガス・オール電化' },
            { key: '建築確認番号', label: '建築確認番号（未完成は必須）', condition: 'incomplete' }
        ],
        // 土地
        land: [
            { key: '土地面積',     label: '土地面積（㎡）' },
            { key: '土地状況',     label: '土地状況（未造成/古家あり/更地）' },
            { key: '造成完了予定', label: '造成完了予定年月（未造成の場合）', condition: 'undeveloped' },
            { key: '引渡可能時期', label: '引渡可能時期' },
            { key: '建築条件',     label: '建築条件付/なし' },
            { key: '前面道路',     label: '前面道路' },
            { key: '私道負担',     label: '私道負担' },
            { key: '用途地域',     label: '用途地域' },
            { key: '建ぺい率',     label: '建ぺい率（%）' },
            { key: '容積率',       label: '容積率（%）' },
            { key: '地目',         label: '地目' },
            { key: '敷地権利',     label: '敷地の権利' },
            { key: '上水道',       label: '上水道' },
            { key: '下水道',       label: '下水道' },
            { key: 'ガス',         label: 'ガス' }
        ],
        // マンション/タウンハウス
        mansion: [
            { key: '専有面積',     label: '専有面積（㎡）' },
            { key: '間取り',       label: '間取りタイプ' },
            { key: '築年月',       label: '築年月（中古は必須）', condition: 'used' },
            { key: '構造',         label: '構造' },
            { key: '階数',         label: '階建' },
            { key: '所在階',       label: '所在階' },
            { key: '向き',         label: '主要開口部の向き（8方位）' },
            { key: 'バルコニー面積', label: 'バルコニー面積（㎡）' },
            { key: '管理費',       label: '管理費（円/月）' },
            { key: '修繕積立金',   label: '修繕積立金（円/月）' },
            { key: '修繕積立基金', label: '修繕積立基金（円・新築/未入居の場合は必須）' },
            { key: '管理形態',     label: '管理形態' },
            { key: '管理員',       label: '管理員の勤務形態' },
            { key: '完成時期',     label: '完成時期 or 完成予定時期' },
            { key: '引渡可能時期', label: '引渡可能時期' },
            { key: '総戸数',       label: '総戸数' },
            { key: '敷地権利',     label: '敷地の権利' },
            { key: '建築確認番号', label: '建築確認番号（未完成は必須）', condition: 'incomplete' }
        ]
    };

    // ======== キャッチコメント禁止用語 ========
    // 規定書「コピー表現（不当表示）」「差別表現」より抽出
    var FORBIDDEN_TERMS = [
        // 完全否定
        { term: '完璧',     reason: '不当表示の恐れ：合理的根拠が必要' },
        { term: '完ぺき',   reason: '不当表示の恐れ：合理的根拠が必要' },
        { term: '完全',     reason: '不当表示の恐れ：合理的根拠が必要' },
        { term: '絶対',     reason: '不当表示の恐れ：合理的根拠が必要' },
        { term: '万全',     reason: '不当表示の恐れ：合理的根拠が必要' },
        // 最上級
        { term: '最高',     reason: '最上級表現：根拠表記が必要' },
        { term: '最高級',   reason: '最上級表現：根拠表記が必要' },
        { term: '極',       reason: '最上級表現：根拠表記が必要' },
        { term: '特級',     reason: '最上級表現：根拠表記が必要' },
        // 比較最上
        { term: '日本一',   reason: '調査元の表記が必要' },
        { term: '業界一',   reason: '調査元の表記が必要' },
        { term: '日本初',   reason: '調査元の表記が必要' },
        { term: 'トップ',   reason: '調査元の表記が必要' },
        { term: 'NO.1',     reason: '調査元の表記が必要' },
        { term: '一番',     reason: '調査元の表記が必要' },
        { term: '当社だけ', reason: '調査元の表記が必要' },
        { term: '他に類をみない', reason: '調査元の表記が必要' },
        // 安値強調
        { term: '買得',     reason: '価格訴求：根拠表記が必要' },
        { term: '掘出',     reason: '価格訴求：根拠表記が必要' },
        { term: '土地値',   reason: '価格訴求：根拠表記が必要' },
        { term: '格安',     reason: '価格訴求：根拠表記が必要' },
        { term: '投売り',   reason: '価格訴求：根拠表記が必要' },
        { term: '破格',     reason: '価格訴求：根拠表記が必要' },
        { term: '特安',     reason: '価格訴求：根拠表記が必要' },
        { term: '激安',     reason: '価格訴求：根拠表記が必要' },
        { term: '特別価格', reason: '価格訴求：根拠表記が必要' },
        { term: '特別値下げ', reason: '価格訴求：根拠表記が必要' },
        { term: 'バーゲン', reason: '価格訴求：根拠表記が必要' },
        { term: 'お得感',   reason: '価格訴求：根拠表記が必要' },
        // あおり
        { term: '売り切れ必至', reason: 'あおり表記禁止' },
        { term: '二度と得がたい', reason: 'あおり表記禁止' },
        { term: '価格交渉可', reason: '価格交渉に関する表記は不可' },
        { term: '値下げ交渉', reason: '価格交渉に関する表記は不可' },
        // 差別・地域評価
        { term: '土地柄のよい', reason: '差別表現の恐れ' },
        { term: '一等地',   reason: '差別表現の恐れ' },
        { term: '由緒ある土地', reason: '差別表現の恐れ' },
        { term: '正統な土地', reason: '差別表現の恐れ' },
        { term: '良い地盤', reason: '差別観点リスク：「固い地盤」等に言い換え' },
        { term: '良好な地盤', reason: '差別観点リスク' },
        // 性別関連
        { term: '奥さま',   reason: '不快表現：「妻」「主婦」等を使用' },
        { term: 'ご主人',   reason: '不快表現：「夫」等を使用' },
        { term: '旦那さま', reason: '不快表現' },
        { term: 'サラリーマン', reason: '性別限定職業：「会社員」へ言い換え' },
        { term: '営業マン', reason: '性別限定職業：「営業担当」へ言い換え' },
        { term: 'ガードマン', reason: '性別限定職業：「警備員」へ言い換え' },
        { term: '看護婦',   reason: '性別限定職業：「看護師」へ言い換え' },
        { term: 'カメラマン', reason: '性別限定職業：「写真家」へ言い換え' },
        // SUUMO関連禁止
        { term: 'オーナーチェンジ', reason: '居住用以外の物件は掲載不可' },
        { term: '投資',     reason: '投資用物件は掲載不可' },
        { term: '利殖',     reason: '投資用訴求は不可' },
        { term: '民泊',     reason: '事業用訴求は不可' },
        // 学校関連
        { term: '有名校',   reason: '差別表現' },
        { term: '著名校',   reason: '差別表現' },
        { term: '伝統校',   reason: '差別表現' },
        { term: '名門校',   reason: '差別表現' },
        { term: '人気校',   reason: '差別表現' },
        // ポータルサイト誘導
        { term: 'http://',  reason: 'URLの直接表記は不可' },
        { term: 'https://', reason: 'URLの直接表記は不可' },
        { term: 'で検索',   reason: 'SUUMO以外のサイトへの誘導は不可' }
    ];

    // ======== 根拠表記が必要な用語（要注意ワード） ========
    var EVIDENCE_REQUIRED_TERMS = [
        { term: '大手',     advice: '具体的な根拠（取引実績数等）を併記' },
        { term: '超',       advice: '具体的な根拠を併記' },
        { term: '屈指',     advice: '具体的な根拠を併記' },
        { term: '抜群',     advice: '具体的な根拠を併記' },
        { term: '特選',     advice: '選別基準を併記（任意）' },
        { term: '厳選',     advice: '選別基準を併記（任意）' },
        { term: '人気',     advice: '合理的根拠を併記' },
        { term: '優遇',     advice: '銀行ローン文脈では「マイナス」へ言い換え' },
        { term: '最終',     advice: '事実であることが必要（最終販売の場合のみ）' },
        { term: 'ラストチャンス', advice: '事実であることが必要' },
        { term: '陽当り良好', advice: '合理的根拠を併記' },
        { term: '通風良好', advice: '合理的根拠を併記' },
        { term: '眺望良好', advice: '合理的根拠を併記' }
    ];

    // ======== 価格表記制約 ========
    var PRICE_CONSTRAINTS = {
        unit:           '万円', // 価格単位
        bandUnit:       100,    // 価格帯単位（100万円）
        bandUnitLarge:  1000,   // 著しく高額時の単位（1000万円）
        // 価格に必ず含むもの
        mustInclude: {
            house:   ['消費税', '上下水道設備負担金', 'ガス負担金', '建築確認費用', '住宅性能保証料', '外構工事費'],
            land:    ['擁壁工事代', '上下水道設備負担金', 'ガス負担金'],
            mansion: ['消費税', '必購入の分譲駐車場代', '必購入のトランクルーム代']
        },
        // 二重価格の要件
        doublePrice: {
            minPriorPeriodMonths: 2, // 旧価格は2か月以上公表していた価格
            maxFromChangeDate: 6,    // 値下げから6か月以内
            requireChangeDate: true  // 旧/新価格公表日の明示必要
        }
    };

    // ======== その他制限事項：必須記載項目 ========
    var SPECIAL_DISCLOSURES = [
        { trigger: '再建築不可',   text: '再建築不可' },
        { trigger: '市街化調整',   text: '市街化調整区域' },
        { trigger: 'セットバック', text: 'セットバック要' },
        { trigger: '高圧線下',     text: '高圧線下（建築制限あり）' },
        { trigger: '計画道路',     text: '一部都市計画道路' },
        { trigger: '事故物件',     text: '心理的瑕疵あり/告知事項あり' },
        { trigger: '農地',         text: '農地法届出要 or 農地転用許可要' },
        { trigger: '一棟リノベ',   text: '一棟リノベーションマンション' }
    ];

    // ======== オーナー（MinaTech）情報デフォルト ========
    var DEFAULT_BROKER = {
        social_name:        '株式会社MinaTech',
        license_number:     '', // 宅建免許番号（要入力）
        association:        '（公社）神奈川県宅地建物取引業協会会員',
        phone:              '',
        address:            '〒251-0055 神奈川県藤沢市南藤沢3-12 クリオ藤沢駅前 7階',
        association_council:'首都圏不動産公正取引協議会加盟事業者'
    };

    // ======== 画像カテゴリ ========
    var IMAGE_CATEGORIES = {
        house: [
            '完成予想図(外観)', '完成予想図(内観)', '街並完成予想図',
            '現地外観写真', '現地土地写真', '前面道路を含む現地写真', 'その他現地',
            'リビング', 'リビング以外の居室', '和室', 'キッチン', '浴室', 'トイレ', '洗面所',
            '収納', '玄関', 'バルコニー', '庭', '駐車場',
            '間取り図', '区画図', '全体区画図', '現地案内図',
            '住戸からの眺望写真', '構造・工法・仕様写真', '設備写真',
            '同形状・同仕様写真', 'モデルハウス写真',
            '省エネ性能ラベル', '建物プラン例(外観写真)', 'その他'
        ],
        land: [
            '現地土地写真', '前面道路を含む現地写真', '区画図', '全体区画図', '現地案内図',
            '区画図+建物プラン例', '建物プラン例(間取り図)', '建物プラン例(パース・外観)', 'その他'
        ],
        mansion: [
            '完成予想図(外観)', '完成予想図(内観)',
            '現地外観写真', 'リビング', 'リビング以外の居室', '和室', 'キッチン',
            '浴室', 'トイレ', '洗面所', '収納', '玄関', 'バルコニー',
            '間取り図', '現地案内図', '住戸からの眺望写真',
            '同形状・同仕様写真', 'モデルルーム写真',
            'エントランス', 'ロビー', '駐車場', 'その他共用部',
            '構造・工法・仕様写真', '設備写真',
            '省エネ性能ラベル', 'その他'
        ]
    };

    // ======== 公開API ========
    return {
        PROPERTY_TYPES: PROPERTY_TYPES,
        BUILDING_STATUS: BUILDING_STATUS,
        SALES_STATUS: SALES_STATUS,
        TRADE_PARTIES: TRADE_PARTIES,
        STRUCTURES: STRUCTURES,
        CONSTRUCTION_METHODS: CONSTRUCTION_METHODS,
        USE_ZONES: USE_ZONES,
        LAND_RIGHTS: LAND_RIGHTS,
        LEASEHOLD_TYPES: LEASEHOLD_TYPES,
        JIMOKU: JIMOKU,
        WATER_SUPPLY: WATER_SUPPLY,
        SEWERAGE: SEWERAGE,
        GAS: GAS,
        LAND_STATUS: LAND_STATUS,
        MANAGEMENT_FORM: MANAGEMENT_FORM,
        MANAGEMENT_STAFF: MANAGEMENT_STAFF,
        PARKING_TYPES: PARKING_TYPES,
        REQUIRED_FIELDS: REQUIRED_FIELDS,
        FORBIDDEN_TERMS: FORBIDDEN_TERMS,
        EVIDENCE_REQUIRED_TERMS: EVIDENCE_REQUIRED_TERMS,
        PRICE_CONSTRAINTS: PRICE_CONSTRAINTS,
        SPECIAL_DISCLOSURES: SPECIAL_DISCLOSURES,
        DEFAULT_BROKER: DEFAULT_BROKER,
        IMAGE_CATEGORIES: IMAGE_CATEGORIES
    };
})();
