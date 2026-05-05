/**
 * 判定説明文ジェネレータ
 * 各評価軸について、計算式・判定根拠・実務的な意味を自然文で生成。
 * HTML表示とファイルエクスポート（CSV/Excel/JSON）の両方で使用。
 */
var Explanation = (function() {
    'use strict';

    function fmt(n) {
        if (n === null || n === undefined || isNaN(n)) return '-';
        return Number(n).toLocaleString('ja-JP');
    }

    function appraisal(p) {
        if (!p['積算価格(万円)']) return '';
        var total = p['積算価格(万円)'];
        var land = p['土地積算(万円)'];
        var bldg = p['建物積算(万円)'];
        var ratio = p['積算比(%)'];
        var unit = p['土地単価(万円/㎡)'];
        var src = p['地価出典'] || '';
        var price = p['価格(万円)'];

        var lines = [];
        lines.push('【積算評価】');
        lines.push('本物件の積算価格は ' + fmt(total) + '万円（土地 ' + fmt(land) + '万円 + 建物 ' + fmt(bldg) + '万円）と算出されました。');
        lines.push('土地単価は ' + unit + '万円/㎡（' + src + '）を採用し、敷地面積を掛け合わせて土地積算を算出。建物積算は延床面積×構造別再調達単価（RC=22万円/㎡、SRC=24万円/㎡、鉄骨=18万円/㎡、木造=16万円/㎡）に「残存耐用年数÷法定耐用年数」を乗じて経年減価を反映しています。');
        if (p['維持管理補正'] !== undefined && p['維持管理補正'] !== 1.0) {
            var mf = p['維持管理補正'];
            var mlabel = p['維持管理要因'] || '';
            lines.push('さらに不動産鑑定評価基準の「観察減価法」に基づき、維持管理状態を加味した補正係数 ' + mf.toFixed(2) + ' を建物積算に乗じています（要因: ' + mlabel + '）。これはリフォーム・大規模修繕履歴・長期修繕計画・エリア特性（塩害）などを個別要因として観察し、法定耐用年数のみでは捉えきれない物理的・機能的減価を補正するもので、金融機関の担保評価部が用いる実務レンジ(0.80〜1.20)に準拠しています。');
        }
        lines.push('売出価格 ' + fmt(price) + '万円に対する積算比は ' + ratio + '%です。');

        if (ratio >= 100) {
            lines.push('判定：【優良】積算価格が売出価格を上回っており、銀行の担保評価上も有利な水準です。金融機関の積算評価では一般にフルローン（LTV100%）が可能な目安とされ、自己資金を物件価格に投入せず諸費用のみで取得できる可能性があります。共同担保不要、融資審査通過率も高く、再売却時も次の買い手に対して同様の融資枠を提示できるため流動性にも優れます。');
        } else if (ratio >= 80) {
            lines.push('判定：【良好】積算比80〜100%は実務上の「融資が通りやすい目安」とされる水準で、自己資金10〜20%を投入すればアパートローンが通過する想定です。地方銀行・信金・ノンバンクいずれも検討対象となります。ただしフルローンには若干届かないため、取得時の自己資金確保が必要です。');
        } else if (ratio >= 60) {
            lines.push('判定：【要注意】積算比60〜80%は自己資金30%超が必要となる可能性が高く、金利も上振れしやすい水準です。一部の積極的な金融機関（オリックス、SBJ、三井住友トラストL&F等）では融資可能ですが、金利3〜4%台となりDSCRを圧迫します。収支シミュレーションを厳密に行った上で判断してください。');
        } else {
            lines.push('判定：【不可】積算比60%未満は担保評価不足で、アパートローンでは原則融資困難です。現金購入または大幅な頭金（物件価格の40%以上）が前提となります。利回りが著しく高く短期回収が見込める、あるいは特殊な立地価値があるなど別の投資合理性がない限り、投資対象としては見送りが妥当です。');
        }
        return lines.join('\n');
    }

    function income(p) {
        if (!p['収益還元価格(万円)']) return '';
        var iv = p['収益還元価格(万円)'];
        var noi = p['NOI(万円/年)'];
        var cap = p['還元利回り(%)'];
        var iratio = p['収益還元比(%)'];
        var price = p['価格(万円)'];
        var yld = p['表面利回り(%)'];

        var lines = [];
        lines.push('【収益還元評価（直接還元法）】');
        lines.push('本物件のNOI（純収益）は年間 ' + fmt(noi) + '万円と推定されます。これは表面利回り ' + yld + '%から算出した満室想定賃料収入に対し、空室損失5%と運営費率20%（管理費・修繕積立・固都税等）を控除した概算値です。');
        lines.push('このNOIを、所在エリアの期待利回り（還元利回り＝Cap Rate）' + cap + '%で割り戻した収益還元価格は ' + fmt(iv) + '万円となります。Cap Rateはエリアの市場流動性・賃貸需要・金利水準から投資家が要求する利回りで、東京23区で4.5%前後、湘南エリアで5.8%前後、地方都市で7〜8%が目安です。');
        lines.push('売出価格 ' + fmt(price) + '万円に対する収益還元比は ' + iratio + '%です。');

        if (iratio >= 110) {
            lines.push('判定：【割安】収益還元比110%以上は、NOIから逆算した適正価格に対して売出価格が10%以上安いことを意味します。インカムゲイン重視の投資家から見て明確に魅力的な価格設定で、初期投資回収が早く、保有期間中のキャッシュフローも豊富です。空室リスクや賃料下落に対するバッファも確保されており、収益物件として高い評価ができます。');
        } else if (iratio >= 95) {
            lines.push('判定：【適正】収益還元比95〜110%は、市場の期待利回りとほぼ整合した適正価格です。相場並みで割高でも割安でもないため、物件個別の質（立地・設備・入居者属性・修繕状況）が最終判断のポイントとなります。購入後の賃料アップや運営改善による付加価値創出が投資リターンを左右します。');
        } else if (iratio >= 80) {
            lines.push('判定：【やや割高】収益還元比80〜95%は、NOIに対してやや割高な価格設定です。購入後に賃料が下落した場合や空室率が上昇した場合、期待利回りを下回るリスクがあります。立地の将来性や再開発計画などの成長要因が確認できない限り、価格交渉を検討すべき水準です。');
        } else {
            lines.push('判定：【割高】収益還元比80%未満は、NOIが期待利回りに見合わず、キャッシュフローが回りにくい水準です。保有中は返済額と経費でNOIが相殺され、実質的な投資リターンが出ない可能性があります。リノベーションによる賃料アップ、値下げ交渉、または保有目的の見直しが必要です。');
        }
        return lines.join('\n');
    }

    function hazard(p) {
        if (p['ハザード備考'] === undefined) return '';
        var t = p['ハザード津波'], f = p['ハザード洪水'], l = p['ハザード土砂'];
        var note = p['ハザード備考'] || '';
        var maxR = Math.max(t, f, l);
        var lvl = function(v) { return ['低','中','高'][v] || '不明'; };

        var lines = [];
        lines.push('【ハザードリスク評価】');
        lines.push('所在地の災害リスクは、津波リスク「' + lvl(t) + '」、洪水リスク「' + lvl(f) + '」、土砂災害リスク「' + lvl(l) + '」と評価されます。' + (note ? '（備考: ' + note + '）' : ''));
        lines.push('判定は国土交通省「重ねるハザードマップ」・気象庁・各自治体公表の被害想定を市区町村単位で集約したものです。実際のリスクは地番・標高・微地形により大きく変動するため、本評価は一次スクリーニング用としてください。');

        if (maxR >= 2) {
            lines.push('判定：【高リスク】高リスクに該当するハザードが存在します。以下の影響が想定されます: (1)火災保険・地震保険料の上振れ（水災補償付帯で年額数万円増）、(2)災害時の資産毀損リスクと復旧費用負担、(3)売却時の買い手敬遠による流動性低下、(4)金融機関によっては融資減額または謝絶。必ず国交省「重ねるハザードマップ」で地番単位の浸水深・想定津波高を確認し、必要に応じて耐震・嵩上げ工事や損害保険の手厚い付帯を検討してください。');
        } else if (maxR === 1) {
            lines.push('判定：【中リスク】注意区域が一部存在します。地番単位で浸水想定域に含まれるか、含まれない高台にあるかで実質リスクは大きく異なります。自治体ハザードマップでピンポイント確認を行い、含まれる場合は水災補償の有無と保険料を精査してください。含まれない場合は通常物件と同等に扱って差し支えありません。');
        } else {
            lines.push('判定：【低リスク】市区町村レベルで主要ハザードの指定はありません。ただし局所的な内水氾濫・崖地隣接・旧河道など個別要因は別途確認が必要です。重要事項説明書の災害警戒区域欄とハザードマップを併せてご確認ください。');
        }
        return lines.join('\n');
    }

    function financing(p) {
        var fin = p['__financing'];
        if (!fin) return '';
        var lines = [];
        lines.push('【融資適性判定】');
        lines.push('想定融資条件: 融資期間 ' + fin.loanYears + '年（残存耐用年数 ' + fin.remainYears + '年をベースに上限35年でキャップ）、金利 ' + fin.rate + '%（投資用アパートローンの中央値）、LTV ' + fin.ltv + '%（' + fin.ltvNote + '）。');
        lines.push('この条件での想定融資額は ' + fmt(fin.loanAmount) + '万円、元利均等返済による年間返済額は ' + fmt(fin.annualPayment) + '万円（月額 ' + fmt(fin.monthlyPayment) + '万円）となります。');
        if (fin.dscr !== null) {
            lines.push('NOI ' + fmt(p['NOI(万円/年)']) + '万円／年を年間返済額で割ったDSCR（Debt Service Coverage Ratio）は ' + fin.dscr + ' です。DSCRは金融機関が融資審査で重視する指標で、1.0未満は返済原資不足、1.0〜1.2は厳しい、1.3以上で安全圏とされます。');
        }
        lines.push('融資期間は木造22年・鉄骨34年・RC47年の法定耐用年数から築年数を差し引いて算出しています。これは多くの金融機関が「法定耐用年数 − 築年数」または「47年 − 築年数」を融資期間上限としているためです。');

        if (fin.verdict === '融資良好') {
            lines.push('判定：【融資良好】銀行積算評価・キャッシュフロー両面で融資基準を十分満たしており、メガバンク・地銀・信金など幅広い金融機関で融資可能と見込まれます。金利は変動1.5〜2.5%、固定10年2.5〜3.5%程度で調達できる水準です。フルローンに近い条件も期待でき、自己資金効率の高い投資が可能です。');
        } else if (fin.verdict === '融資可能') {
            lines.push('判定：【融資可能】主要な融資基準をクリアしており、積極的な地方銀行・信金・ノンバンクで融資可能と見込まれます。金利は2.5〜4.0%程度、自己資金20〜30%の投入が想定されます。DSCR・LTV双方でバッファが厚くないため、金利上昇局面や空室増加に注意してください。');
        } else if (fin.verdict === '条件厳しい') {
            lines.push('判定：【条件厳しい】DSCRが1.0〜1.1の危険水域にあり、返済後に残る手残りキャッシュフローが僅少です。金利0.5%の上昇や空室率10%の悪化で赤字転落する可能性があります。ノンバンク系の高金利融資しか選択肢がなく、投資効率は著しく低下します。自己資金厚めの投入で借入額を減らすか、価格交渉で取得価格を下げる前提でなければ推奨できません。');
        } else if (fin.verdict === '要確認') {
            lines.push('判定：【要確認】収益情報（表面利回り・価格）が不十分なためDSCRが算出できませんでした。物件概要書の追加情報をご確認いただき、再解析してください。');
        } else {
            lines.push('判定：【融資困難】' + fin.reasons.join('、') + '。アパートローンでの融資は原則困難です。現金購入、大幅な頭金投入、または別物件への切替をご検討ください。');
        }
        lines.push('※本判定は概算です。実際の融資可否はエリア・借主属性（年収・保有資産・既存借入）・金融機関の方針により大きく変動します。あくまで机上目安としてご活用ください。');
        return lines.join('\n');
    }

    function futureValue(p) {
        if (p['将来価値スコア'] === undefined) return '';
        var s = p['将来価値スコア'];
        var pop = p['人口推計2050(%)'];
        var brand = p['ブランド指数'];
        var mode = p['分析モード'] || '投資';
        var lines = [];
        lines.push('【将来価値・出口戦略】');
        lines.push('将来価値スコアは ' + s + '/10点です（' + mode + 'モード）。');
        if (pop !== null && pop !== undefined) {
            lines.push('国立社会保障・人口問題研究所「日本の地域別将来推計人口」によると、所在市区町村の2020年比2050年人口変化率は ' + (pop >= 0 ? '+' : '') + pop + '%と推計されています。' +
                (pop >= 0 ? '都心回帰・再開発需要で人口が維持される地域で、長期の住宅需要が期待できます。' :
                 pop >= -10 ? '緩やかな人口減少局面にあり、立地の質（駅近・商業利便）で明暗が分かれます。' :
                 pop >= -20 ? '人口減少が明確に進むエリアで、30年後に賃貸需要・売却流動性ともに低下するリスクがあります。郊外型の大量供給エリアでは空室率上昇に要警戒。' :
                 '大幅な人口減少が予測される地域で、長期保有では資産価値が半減する可能性があります。短期転売や特殊用途での活用を前提としない限り、実需・投資いずれの目的でも慎重な判断が必要です。'));
        }
        if (brand && brand !== 1.0) {
            lines.push('エリアブランド指数は ' + brand + ' です（1.0=平均）。' +
                (brand >= 1.20 ? '都心一等地・湾岸タワー・高級住宅地に該当し、不動産価格の下支え要因が強いエリアです。リセールバリューの下落耐性が高く、実需・投資双方で出口戦略が立てやすい。' :
                 brand >= 1.10 ? '住宅地としての人気があり、中長期のリセールも期待できるエリアです。同スペック物件でも平均より高値で売却できる傾向があります。' :
                 '市場平均を下回る評価のエリアで、購入時の価格交渉が重要となります。'));
        }
        if (mode === '実需') {
            lines.push('本モードでは投資指標（DSCR・Cap Rate）より、将来価値スコアを総合評価の中心に据えています。実需目的では保有期間が長期（10〜30年）となるため、取得時点の収益性よりも「30年後に売れるか・貸せるか」が最重要指標となります。');
        } else {
            lines.push('投資モードでは将来価値は参考指標として扱い、総合評価は収益・積算・融資適性を主軸にしています。');
        }
        return lines.join('\n');
    }

    function overall(p) {
        var rank = p['評価ランク'] || 'C';
        var score = p['スコア'] || 0;
        var priority = p['優先度'] || '';
        var reasons = p['判断根拠'] || '';

        var lines = [];
        lines.push('【総合判定】');
        lines.push('総合スコア ' + score + '/15点、ランク「' + rank + '」、優先度「' + priority + '」と判定しました。');
        lines.push('加減点の内訳: ' + reasons);

        if (rank === 'S') {
            lines.push('S判定は「即日対応すべき最優先案件」です。エリア・利回り・積算・収益還元・融資適性のすべてで高水準を満たしており、競合他社も注目する可能性が高いため、内見・買付を即日進めることを推奨します。');
        } else if (rank === 'A') {
            lines.push('A判定は「今週中に対応すべき案件」です。主要な評価軸で合格点を取っており、詳細調査（現地確認・レントロール精査・修繕履歴）を経て買付判断に進める水準です。');
        } else if (rank === 'B') {
            lines.push('B判定は「今月中に検討する案件」です。一部評価軸で不足がありますが、価格交渉や条件改善次第で投資対象となりえます。他の候補と比較した上で優先順位を決めてください。');
        } else {
            lines.push('C判定は「原則見送り」です。複数の評価軸で基準を下回っており、投資リスクがリターンを上回る可能性が高い案件です。特別な事情（相場の半額以下、再開発予定地、短期転売など）がない限り、時間を投資する価値は低いと判断されます。');
        }
        return lines.join('\n');
    }

    function condoHealth(p) {
        if (!p['区分健全性_詳細'] || !p['区分健全性_詳細'].length) return '';
        var lines = [];
        lines.push('【区分マンション健全性評価】');
        lines.push('本評価は国交省「マンションの修繕積立金に関するガイドライン」(2021改訂版)、標準管理規約、管理組合実務の観点から、区分所有物件特有の健全性を多角的に判定したものです。');
        p['区分健全性_詳細'].forEach(function(d) { lines.push('・' + d); });
        lines.push('※ これらの要素は物件単体の表面利回りや立地評価では捉えられない「保有中コスト」と「出口流動性」を左右します。特に旧耐震・小規模・修繕積立金過少・組合借入ありの組み合わせは、将来の一時金徴収・売却時の値引き交渉材料となるため、購入前に管理組合総会議事録・長期修繕計画書・重要事項調査報告書の確認を強く推奨します。');
        return lines.join('\n');
    }

    function transactions(p, cmp) {
        if (!cmp) return '';
        var lines = [];
        lines.push('【取引事例比較（国交省不動産情報ライブラリ）】');
        lines.push('同一市区町村の直近成約事例 ' + cmp.sample + '件の中央値は ' + cmp.marketMedian + ' 万円/㎡ です。本物件の単価は ' + cmp.propUnit + ' 万円/㎡ で、市場中央値との乖離率は ' + (cmp.deltaPct >= 0 ? '+' : '') + cmp.deltaPct + '% となっています。');
        if (cmp.deltaPct <= -15) {
            lines.push('判定：【割安】市場中央値を大きく下回っており、取得価格に十分な安全マージンがある水準です。出口（転売）時にも利益を乗せやすく、取引事例比較法の観点から強く推奨できる案件です。');
        } else if (cmp.deltaPct <= -5) {
            lines.push('判定：【やや割安】市場中央値をやや下回っており、相場より有利な取得が可能な水準です。');
        } else if (cmp.deltaPct < 10) {
            lines.push('判定：【適正】市場中央値とほぼ同水準で、適正価格帯と言えます。個別要因（築年・立地微差）で最終判断してください。');
        } else if (cmp.deltaPct < 20) {
            lines.push('判定：【やや割高】市場中央値を上回っており、購入後の含み損リスクに注意が必要です。指値交渉の余地を検討してください。');
        } else {
            lines.push('判定：【割高】市場中央値を大幅に上回っており、現価格での取得は推奨できません。再交渉または見送りを強く推奨します。');
        }
        return lines.join('\n');
    }

    // reinfolib 空間APIによるピンポイント評価（ハザード/都市計画/生活環境/将来人口）
    function geoPinpoint(p) {
        var lines = [];
        var hz = p['__hazardGeo'];
        var cp = p['__cityPlan'];
        var am = p['__amenity'];
        var pop = p['__population'];

        if (!hz && !cp && !am && !pop) return '';

        lines.push('【ピンポイント評価（国土交通省 空間API）】');
        if (p['__geo']) {
            lines.push('緯度経度: ' + p['__geo'].lat.toFixed(6) + ', ' + p['__geo'].lng.toFixed(6) +
                '（国土地理院ジオコーディング: ' + (p['__geo'].matchedTitle || '') + '）');
        }

        if (hz && hz.hits && hz.hits.length > 0) {
            lines.push('・ハザード評価: ' + hz.hits.map(function(h) { return h.label; }).join(' / '));
            lines.push('  （合計 ' + (hz.totalDelta >= 0 ? '+' : '') + hz.totalDelta + '点）');
        } else if (hz) {
            lines.push('・ハザード評価: 洪水・高潮・津波・土砂災害・液状化等の想定区域に該当なし（基準点評価OK）');
        }

        if (cp && cp.hits && cp.hits.length > 0) {
            lines.push('・都市計画評価: ' + cp.hits.map(function(h) { return h.label; }).join(' / '));
            lines.push('  （合計 ' + (cp.totalDelta >= 0 ? '+' : '') + cp.totalDelta + '点）');
        }

        if (am) {
            if (am.schoolDistrict.elementary) {
                lines.push('・学区: ' + am.schoolDistrict.elementary +
                    (am.schoolDistrict.junior ? ' / ' + am.schoolDistrict.junior : ''));
            }
            if (am.stationDaily) {
                lines.push('・最寄駅乗降客数: ' + am.stationDaily.toLocaleString() + '人/日');
            }
            var amenityLabels = [];
            for (var k in am.nearbyAmenities) {
                var a = am.nearbyAmenities[k];
                amenityLabels.push(k + '(' + a.nearest + 'm)');
            }
            if (amenityLabels.length) {
                lines.push('・近隣施設: ' + amenityLabels.join(' / '));
            }
            if (am.inDID) lines.push('・人口集中地区（DID）内 → 市場流動性◎');
            if (am.hits && am.hits.length) {
                lines.push('  （生活環境合計 ' + (am.totalDelta >= 0 ? '+' : '') +
                    (Math.round(am.totalDelta * 10) / 10) + '点）');
            }
        }

        if (pop && pop.available) {
            lines.push('・将来人口予測(2020→2040): ' +
                pop.pop2020.toLocaleString() + '人 → ' + pop.pop2040.toLocaleString() +
                '人（' + Math.round(pop.changeRatio * 100) + '%）');
            if (pop.delta !== 0) {
                lines.push('  ' + pop.label);
            }
        }

        if (p['__geoError']) {
            lines.push('・※ジオコーディング失敗: ' + p['__geoError'] + '（空間APIはスキップされました）');
        }

        return lines.join('\n');
    }

    function buildAll(p) {
        var parts = [appraisal(p), income(p), condoHealth(p), hazard(p),
                     geoPinpoint(p), financing(p), futureValue(p), overall(p)];
        if (p['取引事例_説明']) parts.push(p['取引事例_説明']);
        return parts.filter(function(s) { return s; }).join('\n\n');
    }

    return {
        appraisal: appraisal,
        income: income,
        hazard: hazard,
        financing: financing,
        futureValue: futureValue,
        transactions: transactions,
        condoHealth: condoHealth,
        geoPinpoint: geoPinpoint,
        overall: overall,
        buildAll: buildAll
    };
})();
