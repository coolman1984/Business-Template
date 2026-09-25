/*
 * Ceramica Nova — deterministic demo data for a ceramic tile factory (Beni Suef).
 * Every name, number and company here is fictional. Same seed → same data, so the
 * demo, its screenshots and the sales script never drift between reloads.
 * Works as a classic <script> in the browser and as an ES module import in Node.
 */
(function (root) {
  'use strict';

  var SEED = 20260925;
  var REFERENCE_DATE = '2026-09-25';

  // ---------------------------------------------------------------- random
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Each entity family gets its own stream, so adding data in later phases never reshuffles earlier data.
  function rng(offset) {
    var r = mulberry32(SEED + offset * 7919);
    var api = {
      next: r,
      int: function (a, b) { return a + Math.floor(r() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(r() * arr.length)]; },
      chance: function (p) { return r() < p; },
      between: function (a, b) { return a + r() * (b - a); },
      weighted: function (pairs) {
        var total = 0, i;
        for (i = 0; i < pairs.length; i++) total += pairs[i][1];
        var x = r() * total;
        for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; }
        return pairs[pairs.length - 1][0];
      },
      date: function (fromYear, toIso) {
        var from = Date.UTC(fromYear, 0, 1), to = Date.parse(toIso + 'T00:00:00Z');
        return new Date(from + r() * (to - from)).toISOString().slice(0, 10);
      },
    };
    return api;
  }
  function b(ar, en) { return { ar: ar, en: en }; }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function round5(n) { return Math.round(n / 5) * 5; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ---------------------------------------------------------------- company
  var company = {
    name: b('سيراميكا نوفا', 'Ceramica Nova'),
    legalName: b('شركة نوفا لصناعة السيراميك (ش.م.م) — اسم تجريبي', 'Nova Ceramic Industries LLC — fictional'),
    location: b('المنطقة الصناعية ببياض العرب، بني سويف', 'Bayad El-Arab Industrial Zone, Beni Suef'),
    founded: 2012,
    currency: 'EGP',
    referenceDate: REFERENCE_DATE,
    shifts: [
      { id: 'A', name: b('الوردية أ', 'Shift A'), from: '06:00', to: '14:00' },
      { id: 'B', name: b('الوردية ب', 'Shift B'), from: '14:00', to: '22:00' },
      { id: 'C', name: b('الوردية ج', 'Shift C'), from: '22:00', to: '06:00' },
      { id: 'D', name: b('إداري', 'Day (office)'), from: '08:00', to: '16:00' },
    ],
  };

  var sites = [
    { id: 'S1', name: b('المصنع — بياض العرب', 'Factory — Bayad El-Arab'), type: 'factory' },
    { id: 'S2', name: b('مخزن ومعرض القاهرة الجديدة', 'New Cairo warehouse & showroom'), type: 'distribution' },
  ];

  // ---------------------------------------------------------------- lines, sizes, designs
  var lines = [
    { id: 'L1', name: b('خط 1 — بورسلين', 'Line 1 — Porcelain'), family: 'porcelain', sizes: ['60x60', '60x120'], capacityM2Day: 8000,
      kiln: { lengthM: 210, cycleMin: 55, maxTempC: 1215 }, press: b('مكبس 7200 طن', '7,200 t press') },
    { id: 'L2', name: b('خط 2 — أرضيات', 'Line 2 — Floor tiles'), family: 'floor', sizes: ['40x40', '45x45'], capacityM2Day: 9000,
      kiln: { lengthM: 160, cycleMin: 42, maxTempC: 1160 }, press: b('مكبس 3600 طن', '3,600 t press') },
    { id: 'L3', name: b('خط 3 — حوائط', 'Line 3 — Wall tiles'), family: 'wall', sizes: ['30x60', '25x40'], capacityM2Day: 7000,
      kiln: { lengthM: 150, cycleMin: 40, maxTempC: 1140 }, press: b('مكبس 3000 طن', '3,000 t press') },
  ];

  var families = {
    porcelain: { name: b('بورسلين مزجج', 'Glazed porcelain'), absorptionGroup: 'BIa', absorption: b('أقل من 0.5%', '≤ 0.5%'), bodyRecipe: 'BR-POR' },
    floor: { name: b('بلاط أرضيات', 'Floor tile'), absorptionGroup: 'BIIa', absorption: b('3% – 6%', '3% – 6%'), bodyRecipe: 'BR-FLR' },
    wall: { name: b('بلاط حوائط', 'Wall tile'), absorptionGroup: 'BIII', absorption: b('أكثر من 10%', '> 10%'), bodyRecipe: 'BR-WAL' },
  };

  // m² per box must equal pieces × width × height; the integrity check verifies it.
  var sizes = {
    '60x60': { w: 60, h: 60, pcs: 4, m2Box: 1.44, kgBox: 32, boxesPallet: 40, thicknessMm: 9.5, line: 'L1', family: 'porcelain', basePrice: 500 },
    '60x120': { w: 60, h: 120, pcs: 2, m2Box: 1.44, kgBox: 33, boxesPallet: 32, thicknessMm: 10, line: 'L1', family: 'porcelain', basePrice: 700 },
    '40x40': { w: 40, h: 40, pcs: 9, m2Box: 1.44, kgBox: 25, boxesPallet: 56, thicknessMm: 8, line: 'L2', family: 'floor', basePrice: 245 },
    '45x45': { w: 45, h: 45, pcs: 7, m2Box: 1.4175, kgBox: 24, boxesPallet: 52, thicknessMm: 8, line: 'L2', family: 'floor', basePrice: 270 },
    '30x60': { w: 30, h: 60, pcs: 8, m2Box: 1.44, kgBox: 21, boxesPallet: 56, thicknessMm: 8.5, line: 'L3', family: 'wall', basePrice: 290 },
    '25x40': { w: 25, h: 40, pcs: 15, m2Box: 1.5, kgBox: 19, boxesPallet: 64, thicknessMm: 7.5, line: 'L3', family: 'wall', basePrice: 225 },
  };
  Object.keys(sizes).forEach(function (k) {
    var s = sizes[k];
    s.id = k;
    s.label = b(s.w + '×' + s.h + ' سم', s.w + '×' + s.h + ' cm');
    s.m2Pallet = round2(s.m2Box * s.boxesPallet);
  });

  var finishes = {
    PL: { name: b('مصقول لامع', 'Polished'), priceFactor: 1.04 },
    GL: { name: b('لامع', 'Glossy'), priceFactor: 1.0 },
    MT: { name: b('مطفي', 'Matt'), priceFactor: 0.96 },
    AS: { name: b('مضاد للانزلاق', 'Anti-slip'), priceFactor: 1.02 },
  };

  var designs = [
    { id: 'CAR', name: b('رخام كرارا', 'Carrara Marble'), factor: 1.0, faces: 18 },
    { id: 'CAL', name: b('كالاكاتا ذهبي', 'Calacatta Gold'), factor: 1.1, faces: 24 },
    { id: 'EMP', name: b('إمبرادور بني', 'Emperador Brown'), factor: 1.06, faces: 16 },
    { id: 'TRV', name: b('ترافرتينو', 'Travertino'), factor: 1.0, faces: 12 },
    { id: 'CEM', name: b('أسمنتي رمادي', 'Grey Cement'), factor: 0.95, faces: 8 },
    { id: 'SLT', name: b('سلايت أسود', 'Black Slate'), factor: 1.02, faces: 10 },
    { id: 'ASW', name: b('جرانيت أسوان', 'Aswan Granite'), factor: 1.04, faces: 14 },
    { id: 'TRZ', name: b('تيرازو', 'Terrazzo'), factor: 0.98, faces: 9 },
    { id: 'ONX', name: b('أونيكس', 'Onyx'), factor: 1.15, faces: 20 },
    { id: 'DST', name: b('حجر صحراوي', 'Desert Stone'), factor: 1.0, faces: 10 },
    { id: 'OAK', name: b('خشب بلوط', 'Oak Wood'), factor: 1.05, faces: 12 },
    { id: 'WAL', name: b('خشب جوز', 'Walnut Wood'), factor: 1.06, faces: 12 },
    { id: 'SNS', name: b('رمال سيناء', 'Sinai Sand'), factor: 0.97, faces: 8 },
    { id: 'NLB', name: b('بيج النيل', 'Nile Beige'), factor: 0.94, faces: 6 },
    { id: 'LMS', name: b('لايم ستون', 'Limestone'), factor: 1.0, faces: 10 },
    { id: 'WHT', name: b('أبيض سادة', 'Plain White'), factor: 0.9, faces: 1 },
    { id: 'STA', name: b('رخام ستاتواريو', 'Statuario Marble'), factor: 1.06, faces: 16 },
    { id: 'AND', name: b('موزاييك أندلسي', 'Andalusian Mosaic'), factor: 1.12, faces: 6 },
    { id: 'SEA', name: b('موج البحر', 'Sea Wave'), factor: 1.04, faces: 8 },
    { id: 'SPR', name: b('زهور الربيع — ديكور', 'Spring Blossom — Décor'), factor: 1.14, faces: 4 },
  ];

  // [size, design, finish, status]
  var productSpecs = [
    ['60x60', 'CAR', 'PL'], ['60x60', 'CAR', 'MT'], ['60x60', 'CAL', 'PL'], ['60x60', 'EMP', 'PL'], ['60x60', 'TRV', 'MT'],
    ['60x60', 'CEM', 'MT'], ['60x60', 'SLT', 'MT'], ['60x60', 'ASW', 'PL'], ['60x60', 'TRZ', 'MT'], ['60x60', 'ONX', 'PL'],
    ['60x120', 'CAR', 'PL'], ['60x120', 'CAL', 'PL'], ['60x120', 'EMP', 'PL'], ['60x120', 'CEM', 'MT'], ['60x120', 'TRV', 'MT'], ['60x120', 'ONX', 'PL', 'new'],
    ['40x40', 'DST', 'MT'], ['40x40', 'DST', 'AS'], ['40x40', 'OAK', 'MT'], ['40x40', 'WAL', 'MT'], ['40x40', 'SNS', 'GL'], ['40x40', 'NLB', 'GL', 'discontinued'],
    ['45x45', 'DST', 'MT'], ['45x45', 'OAK', 'MT'], ['45x45', 'SNS', 'AS'], ['45x45', 'NLB', 'GL'], ['45x45', 'LMS', 'MT'], ['45x45', 'WAL', 'MT'],
    ['30x60', 'WHT', 'GL'], ['30x60', 'WHT', 'MT'], ['30x60', 'STA', 'GL'], ['30x60', 'AND', 'GL'], ['30x60', 'SEA', 'GL'], ['30x60', 'SPR', 'GL'],
    ['25x40', 'WHT', 'GL'], ['25x40', 'STA', 'GL'], ['25x40', 'AND', 'GL'], ['25x40', 'SEA', 'GL'], ['25x40', 'SPR', 'GL'], ['25x40', 'WHT', 'MT'],
  ];

  var grades = [
    { id: 'G1', name: b('فرز أول', 'First choice'), priceFactor: 1.0 },
    { id: 'G2', name: b('تجاري', 'Commercial'), priceFactor: 0.86 },
    { id: 'G3', name: b('فرز ثاني', 'Second choice'), priceFactor: 0.68 },
  ];

  // ---------------------------------------------------------------- helpers for people
  var MALE = [
    ['محمد', 'Mohamed'], ['أحمد', 'Ahmed'], ['محمود', 'Mahmoud'], ['مصطفى', 'Mostafa'], ['علي', 'Ali'], ['حسن', 'Hassan'], ['حسين', 'Hussein'],
    ['إبراهيم', 'Ibrahim'], ['خالد', 'Khaled'], ['عمر', 'Omar'], ['يوسف', 'Youssef'], ['عبد الله', 'Abdallah'], ['عبد الرحمن', 'Abdelrahman'],
    ['كريم', 'Karim'], ['طارق', 'Tarek'], ['هشام', 'Hesham'], ['أشرف', 'Ashraf'], ['وليد', 'Walid'], ['سامح', 'Sameh'], ['شريف', 'Sherif'],
    ['عماد', 'Emad'], ['رامي', 'Rami'], ['ياسر', 'Yasser'], ['هاني', 'Hany'], ['أيمن', 'Ayman'], ['سعيد', 'Saeed'], ['جمال', 'Gamal'],
    ['فتحي', 'Fathy'], ['رضا', 'Reda'], ['عادل', 'Adel'], ['ممدوح', 'Mamdouh'], ['صلاح', 'Salah'], ['عصام', 'Essam'], ['ناصر', 'Nasser'],
    ['ماهر', 'Maher'], ['مجدي', 'Magdy'], ['سيد', 'Sayed'], ['عبد الحميد', 'Abdelhamid'], ['شعبان', 'Shaaban'], ['رمضان', 'Ramadan'],
    ['منصور', 'Mansour'], ['حمدي', 'Hamdy'], ['زكريا', 'Zakaria'], ['إسلام', 'Islam'], ['عبد الرحيم', 'Abdelrahim'], ['أسامة', 'Osama'],
  ];
  var FEMALE = [
    ['فاطمة', 'Fatma'], ['مريم', 'Mariam'], ['نورا', 'Noura'], ['منى', 'Mona'], ['هبة', 'Heba'], ['سارة', 'Sara'], ['إيمان', 'Eman'],
    ['دينا', 'Dina'], ['ياسمين', 'Yasmin'], ['رحاب', 'Rehab'], ['أسماء', 'Asmaa'], ['شيماء', 'Shaimaa'], ['نهى', 'Noha'], ['سلمى', 'Salma'],
    ['آية', 'Aya'], ['رنا', 'Rana'], ['مروة', 'Marwa'], ['هدى', 'Hoda'], ['ولاء', 'Walaa'],
  ];
  var FAMILY = [
    ['الشريف', 'El-Sherif'], ['عبد العزيز', 'Abdelaziz'], ['المصري', 'El-Masry'], ['حسانين', 'Hassanein'], ['أبو زيد', 'Abouzeid'],
    ['الطحاوي', 'El-Tahawy'], ['عثمان', 'Osman'], ['الجمال', 'El-Gamal'], ['سليمان', 'Soliman'], ['فرج', 'Farag'], ['النجار', 'El-Naggar'],
    ['الشاذلي', 'El-Shazly'], ['البنا', 'El-Banna'], ['رزق', 'Rizk'], ['حنفي', 'Hanafy'], ['عبد الغني', 'Abdelghany'], ['السيد', 'El-Sayed'],
    ['خليل', 'Khalil'], ['عوض', 'Awad'], ['بدوي', 'Badawy'], ['قاسم', 'Kassem'], ['زايد', 'Zayed'], ['حمودة', 'Hamouda'], ['شحاتة', 'Shehata'],
    ['الفقي', 'El-Feky'], ['درويش', 'Darwish'], ['الخولي', 'El-Kholy'], ['مرسي', 'Morsy'], ['القاضي', 'El-Kady'], ['سالم', 'Salem'],
    ['عامر', 'Amer'], ['نصار', 'Nassar'], ['الصعيدي', 'El-Saidy'], ['الفيومي', 'El-Fayoumy'], ['عبد الرحيم', 'Abdelrahim'],
  ];
  var COPTIC_MALE = [['مينا', 'Mina'], ['بيتر', 'Peter'], ['جرجس', 'Girgis'], ['مايكل', 'Michael'], ['ماجد', 'Maged'], ['عادل', 'Adel'], ['صموئيل', 'Samuel']];
  var COPTIC_FEMALE = [['مارينا', 'Marina'], ['كريستين', 'Christine'], ['إيريني', 'Irene'], ['مريم', 'Mariam']];
  var COPTIC_FAMILY = [['عبد المسيح', 'Abdelmessih'], ['غالي', 'Ghaly'], ['إسكندر', 'Iskandar'], ['حنا', 'Hanna'], ['بشاي', 'Beshay'], ['تادرس', 'Tadros']];

  function personName(r, gender) {
    var coptic = r.chance(0.1);
    var first = coptic ? r.pick(gender === 'F' ? COPTIC_FEMALE : COPTIC_MALE) : r.pick(gender === 'F' ? FEMALE : MALE);
    var father = coptic ? r.pick(COPTIC_MALE) : r.pick(MALE);
    var fam = coptic ? r.pick(COPTIC_FAMILY) : r.pick(FAMILY);
    return b(first[0] + ' ' + father[0] + ' ' + fam[0], first[1] + ' ' + father[1] + ' ' + fam[1]);
  }

  // ---------------------------------------------------------------- generators
  function genProducts() {
    var r = rng(1);
    var launchYears = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
    return productSpecs.map(function (spec, i) {
      var size = sizes[spec[0]], design = designs.filter(function (d) { return d.id === spec[1]; })[0], finish = finishes[spec[2]];
      var first = round5(size.basePrice * design.factor * finish.priceFactor);
      var family = families[size.family];
      var status = spec[3] || 'active';
      var product = {
        id: 'P' + pad(i + 1, 3),
        code: 'NV-' + spec[0].replace('x', '') + '-' + spec[1] + '-' + spec[2],
        name: b(design.name.ar + ' ' + size.w + '×' + size.h + ' ' + finish.name.ar, design.name.en + ' ' + size.w + '×' + size.h + ' ' + finish.name.en),
        designId: design.id,
        sizeId: spec[0],
        finish: spec[2],
        family: size.family,
        line: size.line,
        bodyRecipe: family.bodyRecipe,
        absorptionGroup: family.absorptionGroup,
        faces: design.faces,
        status: status,
        launched: status === 'new' ? '2026-06-01' : r.pick(launchYears) + '-0' + r.int(1, 9) + '-01',
        prices: grades.map(function (g) { return { grade: g.id, perM2: round5(first * g.priceFactor) }; }),
        stdCostPerM2: round5(first * r.between(0.55, 0.62)),
        glazeRecipe: size.family === 'porcelain' ? (spec[2] === 'PL' ? 'GLZ-PL' : 'GLZ-PMT') : size.family === 'floor' ? (spec[2] === 'GL' ? 'GLZ-FGL' : 'GLZ-FMT') : 'GLZ-WGL',
        inkGramsPerM2: design.id === 'WHT' ? 0 : r.int(8, 22),
        glazeGramsPerM2: size.family === 'porcelain' ? r.int(480, 560) : size.family === 'floor' ? r.int(420, 500) : r.int(380, 440),
      };
      if (spec[2] === 'AS') product.slipRating = 'R11';
      if (size.family === 'floor') product.pei = r.pick(['PEI III', 'PEI IV']);
      return product;
    });
  }

  var MATERIAL_CATEGORIES = {
    body: b('خامات الجسم', 'Body raw materials'),
    glaze: b('فريت وجليز', 'Frits & glazes'),
    ink: b('أحبار الطباعة', 'Inkjet inks'),
    packaging: b('تعبئة وتغليف', 'Packaging'),
    chemical: b('كيماويات وزيوت', 'Chemicals & oils'),
    consumable: b('مستهلكات تشغيل وسلامة', 'Operating & safety consumables'),
    lab: b('مستلزمات المعمل', 'Lab supplies'),
  };

  // [code, ar, en, category, unit, origin, costPerUnit, supplierId, warehouse]
  var materialRows = [
    ['RM-B01', 'طفلة أسوان حمراء', 'Aswan red clay', 'body', 'ton', 'EG', 850, 'SUP-03', 'WH-RM'],
    ['RM-B02', 'طفلة سيناء بيضاء', 'Sinai white clay', 'body', 'ton', 'EG', 1200, 'SUP-02', 'WH-RM'],
    ['RM-B03', 'طفلة كلابشة', 'Kalabsha clay', 'body', 'ton', 'EG', 950, 'SUP-03', 'WH-RM'],
    ['RM-B04', 'كاولين مصري مغسول', 'Washed Egyptian kaolin', 'body', 'ton', 'EG', 1900, 'SUP-06', 'WH-RM'],
    ['RM-B05', 'بول كلاي مستورد', 'Imported ball clay', 'body', 'ton', 'UA', 6200, 'SUP-01', 'WH-RM'],
    ['RM-B06', 'فلسبار صوديوم', 'Sodium feldspar', 'body', 'ton', 'EG', 1600, 'SUP-04', 'WH-RM'],
    ['RM-B07', 'فلسبار بوتاسيوم', 'Potassium feldspar', 'body', 'ton', 'EG', 2100, 'SUP-04', 'WH-RM'],
    ['RM-B08', 'رمل زجاج', 'Glass sand', 'body', 'ton', 'EG', 450, 'SUP-05', 'WH-RM'],
    ['RM-B09', 'رمل سيليكا مغسول', 'Washed silica sand', 'body', 'ton', 'EG', 600, 'SUP-05', 'WH-RM'],
    ['RM-B10', 'تلك', 'Talc', 'body', 'ton', 'EG', 2800, 'SUP-07', 'WH-RM'],
    ['RM-B11', 'دولوميت', 'Dolomite', 'body', 'ton', 'EG', 700, 'SUP-07', 'WH-RM'],
    ['RM-B12', 'كربونات كالسيوم', 'Calcium carbonate', 'body', 'ton', 'EG', 650, 'SUP-07', 'WH-RM'],
    ['RM-B13', 'بنتونيت', 'Bentonite', 'body', 'ton', 'EG', 2300, 'SUP-06', 'WH-RM'],
    ['RM-B14', 'كسر بلاط مطحون (مُعاد تدويره)', 'Recycled ground tile', 'body', 'ton', 'EG', 150, null, 'WH-RM'],
    ['RM-B15', 'نيفلين سيانيت', 'Nepheline syenite', 'body', 'ton', 'NO', 7400, 'SUP-01', 'WH-RM'],
    ['RM-B16', 'ولاستونيت', 'Wollastonite', 'body', 'ton', 'IN', 5200, 'SUP-01', 'WH-RM'],
    ['GL-F01', 'فريت شفاف لامع', 'Transparent glossy frit', 'glaze', 'ton', 'ES', 42000, 'SUP-08', 'WH-CH'],
    ['GL-F02', 'فريت مطفي', 'Matt frit', 'glaze', 'ton', 'ES', 45000, 'SUP-08', 'WH-CH'],
    ['GL-F03', 'فريت أبيض زركوني', 'Zircon white frit', 'glaze', 'ton', 'IT', 58000, 'SUP-09', 'WH-CH'],
    ['GL-F04', 'فريت ساتان', 'Satin frit', 'glaze', 'ton', 'ES', 47000, 'SUP-08', 'WH-CH'],
    ['GL-F05', 'فريت بورسلين', 'Porcelain frit', 'glaze', 'ton', 'IT', 52000, 'SUP-09', 'WH-CH'],
    ['GL-F06', 'فريت منخفض الحرارة', 'Low-temperature frit', 'glaze', 'ton', 'EG', 34000, 'SUP-12', 'WH-CH'],
    ['GL-G01', 'إنجوب أبيض', 'White engobe', 'glaze', 'ton', 'EG', 26000, 'SUP-12', 'WH-CH'],
    ['GL-G02', 'إنجوب بورسلين', 'Porcelain engobe', 'glaze', 'ton', 'ES', 38000, 'SUP-08', 'WH-CH'],
    ['GL-G03', 'جليز لامع للحوائط', 'Wall glossy glaze', 'glaze', 'ton', 'CN', 31000, 'SUP-10', 'WH-CH'],
    ['GL-G04', 'جليز مطفي للأرضيات', 'Floor matt glaze', 'glaze', 'ton', 'CN', 29000, 'SUP-10', 'WH-CH'],
    ['GL-G05', 'جليز حماية شفاف', 'Protective transparent glaze', 'glaze', 'ton', 'TR', 36000, 'SUP-11', 'WH-CH'],
    ['GL-G06', 'جليز حبيبات مضاد للانزلاق', 'Anti-slip grit glaze', 'glaze', 'ton', 'ES', 64000, 'SUP-08', 'WH-CH'],
    ['GL-G07', 'جليز قابل للتلميع', 'Polishable glaze', 'glaze', 'ton', 'IT', 61000, 'SUP-09', 'WH-CH'],
    ['GL-G08', 'جليز ساتان', 'Satin glaze', 'glaze', 'ton', 'TR', 35000, 'SUP-11', 'WH-CH'],
    ['GL-R01', 'زركونيوم سيليكات', 'Zirconium silicate', 'glaze', 'ton', 'AU', 110000, 'SUP-13', 'WH-CH'],
    ['GL-R02', 'أكسيد الزنك', 'Zinc oxide', 'glaze', 'ton', 'EG', 98000, 'SUP-13', 'WH-CH'],
    ['GL-R03', 'ألومينا مكلسنة', 'Calcined alumina', 'glaze', 'ton', 'EG', 54000, 'SUP-13', 'WH-CH'],
    ['GL-R04', 'كربونات الباريوم', 'Barium carbonate', 'glaze', 'ton', 'CN', 47000, 'SUP-13', 'WH-CH'],
    ['GL-R05', 'كاولين جليز', 'Glaze kaolin', 'glaze', 'ton', 'EG', 4200, 'SUP-06', 'WH-CH'],
    ['GL-R06', 'CMC كاربوكسي ميثيل سليلوز', 'CMC carboxymethyl cellulose', 'glaze', 'kg', 'CN', 180, 'SUP-27', 'WH-CH'],
    ['IN-01', 'حبر أزرق', 'Blue ink', 'ink', 'kg', 'ES', 1250, 'SUP-14', 'WH-INK'],
    ['IN-02', 'حبر بني', 'Brown ink', 'ink', 'kg', 'ES', 1100, 'SUP-14', 'WH-INK'],
    ['IN-03', 'حبر بيج', 'Beige ink', 'ink', 'kg', 'IT', 980, 'SUP-15', 'WH-INK'],
    ['IN-04', 'حبر أصفر', 'Yellow ink', 'ink', 'kg', 'IT', 1050, 'SUP-15', 'WH-INK'],
    ['IN-05', 'حبر أسود', 'Black ink', 'ink', 'kg', 'CN', 900, 'SUP-16', 'WH-INK'],
    ['IN-06', 'حبر وردي', 'Pink ink', 'ink', 'kg', 'ES', 1380, 'SUP-14', 'WH-INK'],
    ['IN-07', 'حبر لامع (تأثير)', 'Glossy effect ink', 'ink', 'kg', 'IT', 1450, 'SUP-15', 'WH-INK'],
    ['IN-08', 'حبر مطفي (تأثير)', 'Matt effect ink', 'ink', 'kg', 'IT', 1420, 'SUP-15', 'WH-INK'],
    ['IN-09', 'حبر لاصق للحبيبات', 'Glue ink for granules', 'ink', 'kg', 'CN', 860, 'SUP-16', 'WH-INK'],
    ['IN-10', 'حبر معدني (تأثير)', 'Metallic effect ink', 'ink', 'kg', 'ES', 1950, 'SUP-14', 'WH-INK'],
    ['PK-C01', 'كرتونة 60×60', 'Carton 60×60', 'packaging', 'pc', 'EG', 21, 'SUP-17', 'WH-PK'],
    ['PK-C02', 'كرتونة 60×120', 'Carton 60×120', 'packaging', 'pc', 'EG', 34, 'SUP-17', 'WH-PK'],
    ['PK-C03', 'كرتونة 40×40', 'Carton 40×40', 'packaging', 'pc', 'EG', 14, 'SUP-21', 'WH-PK'],
    ['PK-C04', 'كرتونة 45×45', 'Carton 45×45', 'packaging', 'pc', 'EG', 15, 'SUP-21', 'WH-PK'],
    ['PK-C05', 'كرتونة 30×60', 'Carton 30×60', 'packaging', 'pc', 'EG', 16, 'SUP-21', 'WH-PK'],
    ['PK-C06', 'كرتونة 25×40', 'Carton 25×40', 'packaging', 'pc', 'EG', 12, 'SUP-21', 'WH-PK'],
    ['PK-S01', 'فواصل كرتون 60×120', 'Carton separators 60×120', 'packaging', 'pc', 'EG', 4, 'SUP-17', 'WH-PK'],
    ['PK-P01', 'باليتة خشب 120×100', 'Wooden pallet 120×100', 'packaging', 'pc', 'EG', 210, 'SUP-18', 'WH-PK'],
    ['PK-P02', 'باليتة خشب 120×80', 'Wooden pallet 120×80', 'packaging', 'pc', 'EG', 185, 'SUP-18', 'WH-PK'],
    ['PK-P03', 'باليتة تصدير معالجة حراريًا', 'Heat-treated export pallet', 'packaging', 'pc', 'EG', 290, 'SUP-18', 'WH-PK'],
    ['PK-F01', 'فيلم استريتش', 'Stretch film', 'packaging', 'roll', 'EG', 520, 'SUP-19', 'WH-PK'],
    ['PK-F02', 'غطاء انكماش للتصدير', 'Export shrink hood', 'packaging', 'pc', 'EG', 38, 'SUP-19', 'WH-PK'],
    ['PK-T01', 'شريط لاصق', 'Packing tape', 'packaging', 'roll', 'EG', 24, 'SUP-19', 'WH-PK'],
    ['PK-T02', 'شريط ربط بلاستيك', 'Plastic strapping', 'packaging', 'roll', 'EG', 610, 'SUP-19', 'WH-PK'],
    ['PK-T03', 'أبازيم ربط', 'Strapping seals', 'packaging', 'box', 'EG', 140, 'SUP-19', 'WH-PK'],
    ['PK-T04', 'زوايا حماية كرتون', 'Carton corner protectors', 'packaging', 'pc', 'EG', 2, 'SUP-17', 'WH-PK'],
    ['PK-L01', 'ملصقات باركود للباليتات', 'Pallet barcode labels', 'packaging', 'roll', 'EG', 160, 'SUP-20', 'WH-PK'],
    ['PK-L02', 'شريط حبر طابعة الملصقات', 'Label printer ribbon', 'packaging', 'roll', 'EG', 230, 'SUP-20', 'WH-PK'],
    ['CH-01', 'سيليكات صوديوم (مُسيّل)', 'Sodium silicate (deflocculant)', 'chemical', 'ton', 'EG', 9500, 'SUP-28', 'WH-CH'],
    ['CH-02', 'ثلاثي بولي فوسفات الصوديوم', 'Sodium tripolyphosphate', 'chemical', 'kg', 'EG', 62, 'SUP-28', 'WH-CH'],
    ['CH-03', 'مانع رغوة', 'Defoamer', 'chemical', 'kg', 'EG', 95, 'SUP-28', 'WH-CH'],
    ['CH-04', 'مادة رابطة للبودرة', 'Powder binder', 'chemical', 'kg', 'IT', 140, 'SUP-28', 'WH-CH'],
    ['CH-05', 'مثبت تعليق للجليز', 'Glaze suspension agent', 'chemical', 'kg', 'ES', 210, 'SUP-12', 'WH-CH'],
    ['CH-06', 'مذيب تنظيف رؤوس الطباعة', 'Printhead cleaning solvent', 'chemical', 'liter', 'ES', 380, 'SUP-14', 'WH-INK'],
    ['CH-07', 'زيت هيدروليك ISO 46', 'Hydraulic oil ISO 46', 'chemical', 'liter', 'EG', 115, 'SUP-27', 'WH-CH'],
    ['CH-08', 'شحم صناعي', 'Industrial grease', 'chemical', 'kg', 'EG', 145, 'SUP-27', 'WH-CH'],
    ['CH-09', 'زيت جير بوكس', 'Gearbox oil', 'chemical', 'liter', 'EG', 130, 'SUP-27', 'WH-CH'],
    ['CH-10', 'زيت كمبروسور', 'Compressor oil', 'chemical', 'liter', 'EG', 160, 'SUP-27', 'WH-CH'],
    ['CH-11', 'سولار للكلاركات', 'Diesel for forklifts', 'chemical', 'liter', 'EG', 15, 'SUP-29', 'WH-CH'],
    ['CH-12', 'غاز بوتاجاز للكلاركات', 'LPG for forklifts', 'chemical', 'cylinder', 'EG', 290, 'SUP-29', 'WH-CH'],
    ['CS-01', 'كرات ألومينا للطواحين', 'Alumina grinding balls', 'consumable', 'ton', 'CN', 48000, 'SUP-23', 'WH-SP'],
    ['CS-02', 'طوب بطانة ألومينا للطواحين', 'Alumina mill lining bricks', 'consumable', 'pc', 'CN', 360, 'SUP-23', 'WH-SP'],
    ['CS-03', 'أحجار تلميع خشنة', 'Coarse polishing abrasives', 'consumable', 'pc', 'IT', 780, 'SUP-26', 'WH-SP'],
    ['CS-04', 'أحجار تلميع متوسطة', 'Medium polishing abrasives', 'consumable', 'pc', 'IT', 820, 'SUP-26', 'WH-SP'],
    ['CS-05', 'أحجار تلميع ناعمة', 'Fine polishing abrasives', 'consumable', 'pc', 'IT', 870, 'SUP-26', 'WH-SP'],
    ['CS-06', 'أقراص تسوية حواف ماسية', 'Diamond squaring wheels', 'consumable', 'pc', 'IT', 6400, 'SUP-26', 'WH-SP'],
    ['CS-07', 'أقراص قطع ماسية', 'Diamond cutting discs', 'consumable', 'pc', 'CN', 2100, 'SUP-26', 'WH-SP'],
    ['CS-08', 'شبك منخل 63 ميكرون', '63 µm sieve mesh', 'consumable', 'pc', 'EG', 950, 'SUP-23', 'WH-SP'],
    ['CS-09', 'أكياس فلتر مجمع الغبار', 'Dust collector filter bags', 'consumable', 'pc', 'EG', 420, 'SUP-23', 'WH-SP'],
    ['CS-10', 'فلاتر هواء كمبروسور', 'Compressor air filters', 'consumable', 'pc', 'EG', 650, 'SUP-24', 'WH-SP'],
    ['CS-11', 'قفازات عمل', 'Work gloves', 'consumable', 'pair', 'EG', 35, 'SUP-28', 'WH-SP'],
    ['CS-12', 'كمامات غبار FFP2', 'FFP2 dust masks', 'consumable', 'pc', 'EG', 28, 'SUP-28', 'WH-SP'],
    ['CS-13', 'خوذات سلامة', 'Safety helmets', 'consumable', 'pc', 'EG', 140, 'SUP-28', 'WH-SP'],
    ['CS-14', 'أحذية سلامة', 'Safety shoes', 'consumable', 'pair', 'EG', 620, 'SUP-28', 'WH-SP'],
    ['CS-15', 'نظارات حماية', 'Safety goggles', 'consumable', 'pc', 'EG', 55, 'SUP-28', 'WH-SP'],
    ['CS-16', 'سدادات أذن', 'Ear plugs', 'consumable', 'box', 'EG', 190, 'SUP-28', 'WH-SP'],
    ['LB-01', 'ماء مقطر', 'Distilled water', 'lab', 'liter', 'EG', 6, 'SUP-28', 'WH-CH'],
    ['LB-02', 'محلول أزرق الميثيلين (اختبار التشرخ)', 'Methylene blue solution (crazing test)', 'lab', 'liter', 'EG', 240, 'SUP-28', 'WH-CH'],
    ['LB-03', 'حمض الهيدروكلوريك', 'Hydrochloric acid', 'lab', 'liter', 'EG', 90, 'SUP-28', 'WH-CH'],
    ['LB-04', 'هيدروكسيد البوتاسيوم', 'Potassium hydroxide', 'lab', 'kg', 'EG', 160, 'SUP-28', 'WH-CH'],
    ['LB-05', 'كلوريد الأمونيوم', 'Ammonium chloride', 'lab', 'kg', 'EG', 120, 'SUP-28', 'WH-CH'],
    ['LB-06', 'مواد بقع قياسية (اختبار البقع)', 'Standard staining agents', 'lab', 'set', 'IT', 3200, 'SUP-28', 'WH-CH'],
    ['LB-07', 'ورق ترشيح', 'Filter paper', 'lab', 'box', 'EG', 180, 'SUP-28', 'WH-CH'],
    ['LB-08', 'كؤوس قياس كثافة الروبة', 'Slip density cups', 'lab', 'pc', 'IT', 1400, 'SUP-23', 'WH-CH'],
  ];

  var UNITS = {
    ton: b('طن', 't'), kg: b('كجم', 'kg'), pc: b('قطعة', 'pc'), roll: b('لفة', 'roll'), box: b('علبة', 'box'),
    liter: b('لتر', 'L'), m: b('متر', 'm'), cylinder: b('أسطوانة', 'cyl'), pair: b('زوج', 'pair'), set: b('طقم', 'set'),
  };
  var ORIGINS = {
    EG: b('مصر', 'Egypt'), UA: b('أوكرانيا', 'Ukraine'), NO: b('النرويج', 'Norway'), IN: b('الهند', 'India'), ES: b('إسبانيا', 'Spain'),
    IT: b('إيطاليا', 'Italy'), CN: b('الصين', 'China'), TR: b('تركيا', 'Turkey'), AU: b('أستراليا', 'Australia'),
  };

  function genMaterials() {
    var r = rng(2);
    return materialRows.map(function (row) {
      var unit = row[4], imported = row[5] !== 'EG';
      var min = unit === 'ton' ? (row[3] === 'body' ? r.int(120, 900) : r.int(4, 30)) : unit === 'kg' ? r.int(150, 1500)
        : unit === 'pc' ? (row[3] === 'packaging' ? r.int(4000, 30000) : r.int(10, 200)) : r.int(10, 300);
      return {
        id: row[0], code: row[0], name: b(row[1], row[2]), category: row[3], unit: unit, origin: row[5], imported: imported,
        stdCost: row[6], supplierId: row[7], warehouseId: row[8],
        minStock: min, reorderQty: Math.round(min * r.between(1.5, 3)),
        leadTimeDays: imported ? r.int(35, 75) : r.int(3, 14),
      };
    });
  }

  function genRecipes() {
    var body = [
      { id: 'BR-POR', version: 3, name: b('جسم بورسلين', 'Porcelain body'), family: 'porcelain', effectiveFrom: '2025-11-01',
        lines: [['RM-B02', 22], ['RM-B05', 18], ['RM-B04', 8], ['RM-B06', 35], ['RM-B07', 7], ['RM-B09', 8], ['RM-B13', 2]],
        additives: [['CH-01', 0.35], ['CH-02', 0.15]],
        targets: { slipDensity: [1690, 1720], residue63: [0.8, 1.5], powderMoisture: [5.8, 6.4], slipWaterPct: 34 } },
      { id: 'BR-FLR', version: 5, name: b('جسم أرضيات', 'Floor body'), family: 'floor', effectiveFrom: '2026-02-15',
        lines: [['RM-B01', 40], ['RM-B03', 20], ['RM-B06', 15], ['RM-B08', 15], ['RM-B14', 6], ['RM-B11', 4]],
        additives: [['CH-01', 0.4], ['CH-02', 0.1]],
        targets: { slipDensity: [1680, 1710], residue63: [1.5, 2.5], powderMoisture: [5.5, 6.2], slipWaterPct: 36 } },
      { id: 'BR-WAL', version: 2, name: b('جسم حوائط (مونوبوروزا)', 'Wall body (monoporosa)'), family: 'wall', effectiveFrom: '2025-06-01',
        lines: [['RM-B02', 30], ['RM-B01', 15], ['RM-B12', 15], ['RM-B08', 22], ['RM-B16', 8], ['RM-B10', 5], ['RM-B14', 5]],
        additives: [['CH-01', 0.45], ['CH-02', 0.12]],
        targets: { slipDensity: [1670, 1700], residue63: [2.0, 3.0], powderMoisture: [5.6, 6.5], slipWaterPct: 37 } },
    ];
    var glaze = [
      { id: 'ENG-POR', version: 2, name: b('إنجوب بورسلين', 'Porcelain engobe'), lines: [['GL-G02', 70], ['GL-R01', 8], ['GL-R05', 12], ['GL-R03', 10]], targets: { density: [1850, 1900], viscositySec: [35, 45] } },
      { id: 'GLZ-PL', version: 4, name: b('جليز بورسلين قابل للتلميع', 'Polishable porcelain glaze'), lines: [['GL-G07', 62], ['GL-F05', 20], ['GL-R03', 8], ['GL-R05', 10]], targets: { density: [1800, 1850], viscositySec: [30, 40] } },
      { id: 'GLZ-PMT', version: 3, name: b('جليز بورسلين مطفي', 'Matt porcelain glaze'), lines: [['GL-F02', 55], ['GL-F05', 20], ['GL-R02', 5], ['GL-R05', 12], ['GL-R03', 8]], targets: { density: [1780, 1830], viscositySec: [32, 42] } },
      { id: 'GLZ-FMT', version: 6, name: b('جليز أرضيات مطفي', 'Floor matt glaze'), lines: [['GL-G04', 70], ['GL-F02', 15], ['GL-R05', 10], ['GL-R04', 5]], targets: { density: [1760, 1800], viscositySec: [28, 38] } },
      { id: 'GLZ-FGL', version: 4, name: b('جليز أرضيات لامع', 'Floor glossy glaze'), lines: [['GL-F01', 60], ['GL-F03', 20], ['GL-R05', 12], ['GL-R02', 8]], targets: { density: [1760, 1800], viscositySec: [28, 36] } },
      { id: 'GLZ-WGL', version: 5, name: b('جليز حوائط لامع', 'Wall glossy glaze'), lines: [['GL-G03', 65], ['GL-F06', 20], ['GL-F03', 5], ['GL-R05', 10]], targets: { density: [1740, 1780], viscositySec: [26, 34] } },
    ];
    return { body: body, glaze: glaze };
  }

  var warehouses = [
    { id: 'WH-RM', name: b('ساحة الخامات المكشوفة', 'Open raw-materials yard'), site: 'S1', type: 'raw', locations: 12, capacity: b('18,000 طن', '18,000 t'), areaM2: 9000 },
    { id: 'WH-CH', name: b('مخزن الكيماويات والجليزات', 'Chemicals & glazes store'), site: 'S1', type: 'chemical', locations: 40, capacity: b('900 طن', '900 t'), areaM2: 1400 },
    { id: 'WH-INK', name: b('مخزن الأحبار (مُكيّف)', 'Ink store (air-conditioned)'), site: 'S1', type: 'ink', locations: 12, capacity: b('40 طن', '40 t'), areaM2: 180 },
    { id: 'WH-PK', name: b('مخزن مواد التعبئة', 'Packaging store'), site: 'S1', type: 'packaging', locations: 24, capacity: b('1,200 باليتة', '1,200 pallets'), areaM2: 2200 },
    { id: 'WH-SP', name: b('مخزن قطع الغيار', 'Spare-parts store'), site: 'S1', type: 'spares', locations: 180, capacity: b('180 رف', '180 bins'), areaM2: 650 },
    { id: 'WH-FG', name: b('مخزن المنتج التام — المصنع', 'Finished goods — factory'), site: 'S1', type: 'finished', locations: 360, capacity: b('9,000 باليتة', '9,000 pallets'), areaM2: 16000 },
    { id: 'WH-CAI', name: b('مخزن ومعرض القاهرة', 'Cairo warehouse & showroom'), site: 'S2', type: 'finished', locations: 120, capacity: b('2,400 باليتة', '2,400 pallets'), areaM2: 4200 },
  ];

  var SUPPLIER_CATEGORIES = {
    minerals: b('خامات تعدينية محلية', 'Local minerals'), frits: b('فريت وجليز', 'Frits & glazes'), inks: b('أحبار', 'Inks'),
    packaging: b('تعبئة وتغليف', 'Packaging'), spares: b('قطع غيار ومعدات', 'Spare parts & equipment'),
    chemicals: b('كيماويات وزيوت ووقود', 'Chemicals, oils & fuel'), services: b('خدمات نقل', 'Transport services'),
  };
  // [id, ar, en, category, country, city]
  var supplierRows = [
    ['SUP-01', 'المتحدة لاستيراد الخامات الصناعية', 'United Industrial Minerals Import', 'minerals', 'EG', b('الإسكندرية', 'Alexandria')],
    ['SUP-02', 'سيناء البيضاء للطفلات', 'White Sinai Clays', 'minerals', 'EG', b('العريش', 'El-Arish')],
    ['SUP-03', 'أسوان الحديثة للطفلة', 'Modern Aswan Clay', 'minerals', 'EG', b('أسوان', 'Aswan')],
    ['SUP-04', 'الصعيد للفلسبار', 'Upper Egypt Feldspar', 'minerals', 'EG', b('أسوان', 'Aswan')],
    ['SUP-05', 'رمال الصحراء الشرقية', 'Eastern Desert Sands', 'minerals', 'EG', b('الزعفرانة', 'Zafarana')],
    ['SUP-06', 'النيل للكاولين', 'Nile Kaolin Co.', 'minerals', 'EG', b('أبو زنيمة', 'Abu Zenima')],
    ['SUP-07', 'الشرق للتلك والدولوميت', 'Orient Talc & Dolomite', 'minerals', 'EG', b('مرسى علم', 'Marsa Alam')],
    ['SUP-08', 'كاستيون فريتس', 'Castellón Frits S.L.', 'frits', 'ES', b('كاستيون', 'Castellón')],
    ['SUP-09', 'إيميليا سميلتي', 'Emilia Smalti S.p.A.', 'frits', 'IT', b('ساسولو', 'Sassuolo')],
    ['SUP-10', 'فوشان جليز', 'Foshan Glaze Co.', 'frits', 'CN', b('فوشان', 'Foshan')],
    ['SUP-11', 'إسطنبول سيراميك كيميا', 'Istanbul Seramik Kimya', 'frits', 'TR', b('إسطنبول', 'Istanbul')],
    ['SUP-12', 'المصرية للفريت', 'Egyptian Frits Co.', 'frits', 'EG', b('العاشر من رمضان', '10th of Ramadan')],
    ['SUP-13', 'الوادي للأكاسيد والكيماويات', 'Valley Oxides & Chemicals', 'frits', 'EG', b('السادات', 'Sadat City')],
    ['SUP-14', 'كولور جيت للأحبار', 'ColorJet Inks', 'inks', 'ES', b('كاستيون', 'Castellón')],
    ['SUP-15', 'نانو إنك إيطاليا', 'NanoInk Italia', 'inks', 'IT', b('مودينا', 'Modena')],
    ['SUP-16', 'جوانجدونج إنك تك', 'Guangdong InkTech', 'inks', 'CN', b('فوشان', 'Foshan')],
    ['SUP-17', 'الدلتا للكرتون المضلع', 'Delta Corrugated Carton', 'packaging', 'EG', b('طنطا', 'Tanta')],
    ['SUP-18', 'الواحة للباليتات الخشبية', 'Oasis Wooden Pallets', 'packaging', 'EG', b('الفيوم', 'Fayoum')],
    ['SUP-19', 'بلاستيكو للأفلام والشرائط', 'Plastico Films & Straps', 'packaging', 'EG', b('6 أكتوبر', '6th of October')],
    ['SUP-20', 'الهرم للملصقات والطباعة', 'Pyramid Labels & Print', 'packaging', 'EG', b('الجيزة', 'Giza')],
    ['SUP-21', 'بني سويف للكرتون', 'Beni Suef Carton', 'packaging', 'EG', b('بني سويف', 'Beni Suef')],
    ['SUP-22', 'رولرز آند كيلنز', 'Rollers & Kilns Supplies', 'spares', 'IT', b('إيمولا', 'Imola')],
    ['SUP-23', 'الهندسية لقطع الغيار الصناعية', 'Engineering Industrial Parts', 'spares', 'EG', b('القاهرة', 'Cairo')],
    ['SUP-24', 'مركز الرولمان والنقل الميكانيكي', 'Bearings & Transmission Center', 'spares', 'EG', b('القاهرة', 'Cairo')],
    ['SUP-25', 'إلكترو كنترول للأتمتة', 'ElectroControl Automation', 'spares', 'EG', b('العبور', 'El-Obour')],
    ['SUP-26', 'أبريسيف تك للتلميع', 'AbrasiveTech Polishing', 'spares', 'IT', b('فيورانو', 'Fiorano')],
    ['SUP-27', 'مصر للزيوت الصناعية', 'Misr Industrial Oils', 'chemicals', 'EG', b('السويس', 'Suez')],
    ['SUP-28', 'الكيماويات المتحدة', 'United Chemicals', 'chemicals', 'EG', b('القاهرة', 'Cairo')],
    ['SUP-29', 'الوادي للمحروقات', 'Valley Fuels', 'chemicals', 'EG', b('بني سويف', 'Beni Suef')],
    ['SUP-30', 'النقل السريع للشاحنات', 'Express Trucking', 'services', 'EG', b('بني سويف', 'Beni Suef')],
  ];

  function genSuppliers(materials) {
    var r = rng(3);
    return supplierRows.map(function (row) {
      var imported = row[4] !== 'EG';
      return {
        id: row[0], name: b(row[1], row[2]), category: row[3], country: row[4], city: row[5],
        paymentTermsDays: imported ? 0 : r.pick([15, 30, 45, 60]),
        paymentMethod: imported ? b('اعتماد مستندي', 'Letter of credit') : b('آجل', 'Credit'),
        rating: r.weighted([['A', 5], ['B', 4], ['C', 1]]),
        leadTimeDays: imported ? r.int(35, 75) : r.int(2, 14),
        since: r.int(2012, 2024),
        materialIds: materials.filter(function (m) { return m.supplierId === row[0]; }).map(function (m) { return m.id; }),
      };
    });
  }

  // ---------------------------------------------------------------- assets
  var ASSET_TYPES = {
    press: b('مكبس هيدروليك', 'Hydraulic press'), dryer: b('مجفف', 'Dryer'), glazeLine: b('خط طلاء', 'Glazing line'),
    printer: b('طابعة ديجيتال', 'Digital inkjet printer'), kiln: b('فرن رولر', 'Roller kiln'), sorting: b('خط فرز آلي', 'Automatic sorting line'),
    packing: b('ماكينة تعبئة وتربيط', 'Packing & strapping machine'), palletizer: b('روبوت رص باليتات', 'Palletizing robot'),
    polishing: b('خط تلميع', 'Polishing line'), rectifier: b('ماكينة تسوية حواف', 'Squaring / rectifying machine'),
    ballMill: b('طاحونة كرات', 'Ball mill'), slipTank: b('تانك روبة بقلاب', 'Slip tank with agitator'), atomizer: b('مجفف رش (أتومايزر)', 'Spray dryer (atomizer)'),
    silo: b('صومعة بودرة', 'Powder silo'), glazeMill: b('طاحونة جليز', 'Glaze mill'), glazeTank: b('تانك جليز', 'Glaze tank'),
    compressor: b('كمبروسور هواء', 'Air compressor'), airDryer: b('مجفف هواء', 'Air dryer'), gasStation: b('محطة تخفيض ضغط الغاز', 'Gas pressure-reducing station'),
    transformer: b('محول كهرباء', 'Power transformer'), generator: b('مولد طوارئ', 'Emergency generator'), coolingTower: b('برج تبريد', 'Cooling tower'),
    waterPlant: b('محطة معالجة مياه', 'Water treatment plant'), dustCollector: b('مجمع غبار', 'Dust collector'),
    forklift: b('كلارك', 'Forklift'), weighbridge: b('ميزان بسكول', 'Weighbridge'),
    labBreaking: b('جهاز قوة الكسر', 'Breaking-strength tester'), labVacuum: b('جهاز امتصاص بالتفريغ', 'Vacuum absorption tester'),
    labAutoclave: b('أوتوكلاف (اختبار التشرخ)', 'Autoclave (crazing)'), labPlanarity: b('جهاز الأبعاد والاستواء', 'Dimension & planarity gauge'),
    labSpectro: b('سبكتروفوتوميتر (درجة اللون)', 'Spectrophotometer (shade)'),
  };
  var AREAS = {
    L1: lines[0].name, L2: lines[1].name, L3: lines[2].name,
    PREP: b('تحضير الخامات', 'Body preparation'), GLAZE: b('قسم الجليز', 'Glaze department'), UTIL: b('المرافق', 'Utilities'),
    YARD: b('الساحات والمخازن', 'Yards & stores'), LAB: b('المعمل', 'Laboratory'),
  };

  var ASSET_PREFIX = {
    press: 'PRS', dryer: 'DRY', glazeLine: 'GLN', printer: 'PRN', kiln: 'KLN', sorting: 'SRT', packing: 'PCK', palletizer: 'PAL',
    polishing: 'POL', rectifier: 'RCT', ballMill: 'BML', slipTank: 'STK', atomizer: 'ATM', silo: 'SIL', glazeMill: 'GML', glazeTank: 'GTK',
    compressor: 'CMP', airDryer: 'ADR', gasStation: 'GAS', transformer: 'TRF', generator: 'GEN', coolingTower: 'CTW', waterPlant: 'WTP',
    dustCollector: 'DCL', forklift: 'FLT', weighbridge: 'WBR', labBreaking: 'LBK', labVacuum: 'LVC', labAutoclave: 'LAC', labPlanarity: 'LPL', labSpectro: 'LSP',
  };

  function genAssets() {
    var r = rng(4);
    var list = [];
    var counters = {};
    function add(type, area, maker, model, crit, pmBasis, pmInterval, extra) {
      var key = type + '|' + area;
      counters[key] = (counters[key] || 0) + 1;
      var seqNo = counters[key];
      var year = r.int(2012, 2025);
      var meter = pmBasis === 'strokes' ? r.int(2, 60) * 100000 : pmBasis === 'hours' ? r.int(8000, 90000) : null;
      var a = {
        id: 'AS-' + pad(list.length + 1, 3),
        code: ASSET_PREFIX[type] + '-' + (area.indexOf('L') === 0 ? area + '-' : '') + pad(seqNo, 2),
        type: type, area: area, maker: maker, model: model, year: year, criticality: crit,
        status: 'running', pmBasis: pmBasis, pmInterval: pmInterval, meter: meter,
        lastPm: r.date(2026, '2026-09-20'),
        meterAtLastPm: meter == null ? null : Math.max(0, meter - Math.round(pmInterval * r.between(0.05, 1.15))),
      };
      if (extra) for (var k in extra) a[k] = extra[k];
      list.push(a);
      return a;
    }
    lines.forEach(function (ln) {
      var big = ln.id === 'L1';
      add('press', ln.id, 'SACMI', big ? 'PH 7200' : ln.id === 'L2' ? 'PH 3590' : 'PH 3020', 'A', 'strokes', 1500000);
      add('dryer', ln.id, 'SITI B&T', big ? 'EVA 5-deck' : 'EVA 3-deck', 'B', 'hours', 4000);
      add('glazeLine', ln.id, 'Ceramica Systems', 'GL-' + (big ? '1200' : '800'), 'B', 'hours', 2000);
      add('printer', ln.id, big ? 'Durst' : 'EFI Cretaprint', big ? 'Gamma 124 DG' : 'C4', 'A', 'hours', 1000);
      add('kiln', ln.id, big ? 'SACMI' : 'SITI B&T', 'RHK ' + ln.kiln.lengthM + ' m', 'A', 'calendar', 365, { lengthM: ln.kiln.lengthM });
      add('sorting', ln.id, 'System', 'Flawmaster', 'B', 'hours', 3000);
      add('packing', ln.id, 'System', 'Pack-' + (big ? 'XL' : 'M'), 'B', 'hours', 3000);
      add('palletizer', ln.id, 'KUKA', 'KR 180', 'B', 'hours', 5000);
      if (big) {
        add('polishing', ln.id, 'Ancora', 'Levipol 1200', 'A', 'hours', 1500);
        add('rectifier', ln.id, 'Ancora', 'Squaring SQ-1200', 'B', 'hours', 2000);
      }
    });
    for (var i = 0; i < 6; i++) add('ballMill', 'PREP', i < 2 ? 'SACMI' : 'KEDA', i < 2 ? 'Modulo continuous' : 'QMP 40 t', 'A', 'hours', 6000);
    for (i = 0; i < 4; i++) add('slipTank', 'PREP', 'Local fab', '120 m³', 'C', 'calendar', 180);
    add('atomizer', 'PREP', 'SACMI', 'ATM 120', 'A', 'hours', 2500);
    for (i = 0; i < 8; i++) add('silo', 'PREP', 'Local fab', '400 t', 'C', 'calendar', 365);
    for (i = 0; i < 3; i++) add('glazeMill', 'GLAZE', 'KEDA', 'Alsing 3 t', 'B', 'hours', 3000);
    for (i = 0; i < 3; i++) add('glazeTank', 'GLAZE', 'Local fab', '6 m³', 'C', 'calendar', 180);
    for (i = 0; i < 3; i++) add('compressor', 'UTIL', 'Atlas Copco', 'GA 90', 'B', 'hours', 4000);
    add('airDryer', 'UTIL', 'Atlas Copco', 'FD 300', 'C', 'hours', 8000);
    add('gasStation', 'UTIL', 'Local fab', '5 bar → 0.5 bar', 'A', 'calendar', 90);
    add('transformer', 'UTIL', 'El-Sewedy', '2,500 kVA', 'A', 'calendar', 365);
    add('transformer', 'UTIL', 'El-Sewedy', '1,600 kVA', 'A', 'calendar', 365);
    add('generator', 'UTIL', 'Cummins', '1,000 kVA', 'B', 'hours', 500);
    add('coolingTower', 'UTIL', 'Local fab', '400 m³/h', 'C', 'calendar', 180);
    add('waterPlant', 'UTIL', 'Local fab', '30 m³/h', 'C', 'calendar', 90);
    for (i = 0; i < 3; i++) add('dustCollector', 'UTIL', 'Local fab', 'Bag filter 20k m³/h', 'B', 'calendar', 90);
    for (i = 0; i < 10; i++) add('forklift', 'YARD', i < 6 ? 'Toyota' : 'Heli', i < 6 ? '8FD30' : 'CPCD50', 'C', 'hours', 500);
    add('weighbridge', 'YARD', 'Local fab', '80 t', 'B', 'calendar', 180);
    add('labBreaking', 'LAB', 'Gabrielli', 'CRT-1000', 'B', 'calendar', 365);
    add('labVacuum', 'LAB', 'Gabrielli', 'Vacuum-ISO', 'C', 'calendar', 365);
    add('labAutoclave', 'LAB', 'Gabrielli', 'AC-10', 'C', 'calendar', 365);
    add('labPlanarity', 'LAB', 'Gabrielli', 'Planar-3D', 'B', 'calendar', 365);
    add('labSpectro', 'LAB', 'X-Rite', 'Ci7800', 'B', 'calendar', 365);
    // A little realism: one forklift in the workshop, one mill on standby.
    list.filter(function (a) { return a.type === 'forklift'; })[6].status = 'maintenance';
    list.filter(function (a) { return a.type === 'ballMill'; })[5].status = 'standby';
    return list;
  }

  // ---------------------------------------------------------------- spare parts
  // [assetType, ar, en, unit, costRange, variants[] (ar suffix, en suffix)]
  var partTemplates = [
    ['press', 'طقم جوانات هيدروليك', 'Hydraulic seals kit', 'set', [9000, 18000], [['PH 7200', 'PH 7200'], ['PH 3590', 'PH 3590'], ['PH 3020', 'PH 3020']]],
    ['press', 'قالب مكبس علوي', 'Upper press die', 'pc', [180000, 420000], [['60×60', '60×60'], ['60×120', '60×120'], ['40×40', '40×40'], ['45×45', '45×45'], ['30×60', '30×60'], ['25×40', '25×40']]],
    ['press', 'قالب مكبس سفلي', 'Lower press die', 'pc', [160000, 380000], [['60×60', '60×60'], ['60×120', '60×120'], ['40×40', '40×40'], ['45×45', '45×45'], ['30×60', '30×60'], ['25×40', '25×40']]],
    ['press', 'حساس ضغط', 'Pressure transducer', 'pc', [7000, 14000], [['0–400 بار', '0–400 bar'], ['0–600 بار', '0–600 bar']]],
    ['press', 'صمام اتجاهي', 'Directional valve', 'pc', [15000, 32000], [['NG10', 'NG10'], ['NG16', 'NG16'], ['NG25', 'NG25']]],
    ['press', 'طلمبة هيدروليك', 'Hydraulic pump', 'pc', [90000, 180000], [['75 كيلووات', '75 kW'], ['110 كيلووات', '110 kW']]],
    ['press', 'فلتر زيت هيدروليك', 'Hydraulic oil filter', 'pc', [1200, 3200], [['10 ميكرون', '10 µm'], ['25 ميكرون', '25 µm']]],
    ['kiln', 'بكرة سيراميك للفرن', 'Kiln ceramic roller', 'pc', [900, 2600], [['Ø40 × 3.2 م', 'Ø40 × 3.2 m'], ['Ø45 × 3.4 م', 'Ø45 × 3.4 m'], ['Ø50 × 3.6 م', 'Ø50 × 3.6 m'], ['Ø55 × 3.8 م', 'Ø55 × 3.8 m']]],
    ['kiln', 'حارق غاز', 'Gas burner', 'pc', [6500, 12000], [['حارق علوي', 'upper'], ['حارق سفلي', 'lower']]],
    ['kiln', 'ثيرموكبل نوع K', 'Type-K thermocouple', 'pc', [900, 2200], [['500 مم', '500 mm'], ['800 مم', '800 mm'], ['1000 مم', '1000 mm']]],
    ['kiln', 'محرك مروحة الفرن', 'Kiln fan motor', 'pc', [38000, 95000], [['30 كيلووات', '30 kW'], ['55 كيلووات', '55 kW'], ['75 كيلووات', '75 kW']]],
    ['kiln', 'طوب حراري', 'Refractory brick', 'pc', [180, 420], [['عازل', 'insulating'], ['كثيف', 'dense']]],
    ['kiln', 'صمام ملف غاز', 'Gas solenoid valve', 'pc', [4800, 9500], [['1 بوصة', '1 inch'], ['2 بوصة', '2 inch']]],
    ['kiln', 'جهاز كشف لهب', 'Flame detector', 'pc', [3800, 7200], [['أشعة فوق بنفسجية', 'UV'], ['تأين', 'ionization']]],
    ['printer', 'رأس طباعة', 'Print head', 'pc', [65000, 140000], [['Durst', 'Durst'], ['Cretaprint', 'Cretaprint']]],
    ['printer', 'فلتر حبر', 'Ink filter', 'pc', [450, 1100], [['5 ميكرون', '5 µm'], ['10 ميكرون', '10 µm']]],
    ['printer', 'طلمبة حبر', 'Ink pump', 'pc', [7800, 16000], [['Durst', 'Durst'], ['Cretaprint', 'Cretaprint']]],
    ['printer', 'بوردة تحكم الطباعة', 'Print control board', 'pc', [42000, 90000], [['Durst', 'Durst'], ['Cretaprint', 'Cretaprint']]],
    ['ballMill', 'جير بوكس طاحونة', 'Mill gearbox', 'pc', [240000, 480000], [['SACMI Modulo', 'SACMI Modulo'], ['KEDA QMP', 'KEDA QMP']]],
    ['ballMill', 'كوبلنج مرن', 'Flexible coupling', 'pc', [9000, 21000], [['حجم 6', 'size 6'], ['حجم 8', 'size 8']]],
    ['ballMill', 'سير V', 'V-belt', 'pc', [650, 1400], [['SPB 3150', 'SPB 3150'], ['SPC 4000', 'SPC 4000'], ['SPC 5000', 'SPC 5000']]],
    ['atomizer', 'فوهة رش', 'Spray nozzle', 'pc', [1100, 2600], [['2.5 مم', '2.5 mm'], ['3.0 مم', '3.0 mm'], ['3.5 مم', '3.5 mm']]],
    ['atomizer', 'جوانات طلمبة مكبسية', 'Piston pump seals', 'set', [6000, 12000], [['طلمبة 1', 'pump 1'], ['طلمبة 2', 'pump 2']]],
    ['atomizer', 'دوامة (Swirl) فوهة', 'Nozzle swirl insert', 'pc', [380, 900], [['نوع A', 'type A'], ['نوع B', 'type B']]],
    ['sorting', 'حساس ليزر مسافة', 'Laser distance sensor', 'pc', [11000, 24000], [['قياس الاستواء', 'planarity'], ['قياس الأبعاد', 'dimension']]],
    ['sorting', 'كاميرا فحص خطي', 'Line-scan inspection camera', 'pc', [85000, 160000], [['4K', '4K'], ['8K', '8K']]],
    ['sorting', 'سير ناقل', 'Conveyor belt', 'm', [420, 900], [['عرض 40 مم', '40 mm'], ['عرض 60 مم', '60 mm']]],
    ['packing', 'كاسات شفط', 'Vacuum suction cups', 'pc', [300, 800], [['Ø80', 'Ø80'], ['Ø120', 'Ø120']]],
    ['palletizer', 'محرك سيرفو', 'Servo motor', 'pc', [26000, 58000], [['محور 1', 'axis 1'], ['محور 2', 'axis 2'], ['محور 3', 'axis 3']]],
    ['palletizer', 'حساس قرب', 'Proximity sensor', 'pc', [650, 1800], [['M12', 'M12'], ['M18', 'M18'], ['M30', 'M30']]],
    ['polishing', 'رأس تلميع', 'Polishing head', 'pc', [48000, 92000], [['خشن', 'coarse'], ['ناعم', 'fine']]],
    ['rectifier', 'عمود دوران ماسي', 'Diamond spindle', 'pc', [32000, 64000], [['يمين', 'right'], ['شمال', 'left']]],
    ['compressor', 'فاصل زيت', 'Oil separator', 'pc', [4200, 8200], [['GA 90', 'GA 90']]],
    ['compressor', 'طقم صيانة 4000 ساعة', '4,000-hour service kit', 'set', [16000, 28000], [['GA 90', 'GA 90']]],
    ['forklift', 'إطار كلارك', 'Forklift tire', 'pc', [3200, 7800], [['أمامي', 'front'], ['خلفي', 'rear']]],
    ['forklift', 'بطارية 12 فولت', '12 V battery', 'pc', [2600, 4200], [['100 أمبير', '100 Ah'], ['150 أمبير', '150 Ah']]],
    ['forklift', 'تيل فرامل', 'Brake pads', 'set', [900, 1900], [['Toyota', 'Toyota'], ['Heli', 'Heli']]],
    ['forklift', 'فلتر زيت محرك', 'Engine oil filter', 'pc', [320, 620], [['Toyota', 'Toyota'], ['Heli', 'Heli']]],
    ['dryer', 'حساس رطوبة', 'Humidity sensor', 'pc', [5200, 9800], [['مدخل', 'inlet'], ['مخرج', 'outlet']]],
    ['glazeLine', 'قرص جرس الجليز', 'Glaze bell disc', 'pc', [2800, 6200], [['600 مم', '600 mm'], ['800 مم', '800 mm']]],
    ['glazeLine', 'طلمبة جليز', 'Glaze pump', 'pc', [9200, 18000], [['غشائية', 'diaphragm'], ['طرد مركزي', 'centrifugal']]],
    ['glazeLine', 'بخاخ جليز هوائي', 'Airless glaze gun', 'pc', [3600, 7400], [['نوع 1', 'type 1'], ['نوع 2', 'type 2']]],
    ['slipTank', 'قلاب تانك', 'Tank agitator', 'pc', [42000, 76000], [['15 كيلووات', '15 kW'], ['22 كيلووات', '22 kW']]],
    ['dustCollector', 'صمام نفخ عكسي', 'Pulse-jet valve', 'pc', [2100, 4200], [['1.5 بوصة', '1.5 inch']]],
    ['generator', 'فلتر سولار', 'Fuel filter', 'pc', [900, 1800], [['Cummins', 'Cummins']]],
    ['*', 'رولمان بلي', 'Ball bearing', 'pc', [180, 4200], [['6205', '6205'], ['6206', '6206'], ['6208', '6208'], ['6210', '6210'], ['6308', '6308'], ['6310', '6310'], ['6312', '6312'], ['22216', '22216'], ['22220', '22220'], ['NU 312', 'NU 312'], ['UCP 208', 'UCP 208'], ['UCF 210', 'UCF 210']]],
    ['*', 'محرك كهربائي', 'Electric motor', 'pc', [3800, 88000], [['1.5 كيلووات', '1.5 kW'], ['3 كيلووات', '3 kW'], ['5.5 كيلووات', '5.5 kW'], ['7.5 كيلووات', '7.5 kW'], ['11 كيلووات', '11 kW'], ['15 كيلووات', '15 kW'], ['22 كيلووات', '22 kW'], ['37 كيلووات', '37 kW'], ['55 كيلووات', '55 kW'], ['90 كيلووات', '90 kW']]],
    ['*', 'إنفرتر', 'Frequency inverter', 'pc', [5200, 96000], [['1.5 كيلووات', '1.5 kW'], ['4 كيلووات', '4 kW'], ['7.5 كيلووات', '7.5 kW'], ['15 كيلووات', '15 kW'], ['22 كيلووات', '22 kW'], ['37 كيلووات', '37 kW'], ['55 كيلووات', '55 kW'], ['90 كيلووات', '90 kW']]],
    ['*', 'كونتاكتور', 'Contactor', 'pc', [650, 9800], [['9 أمبير', '9 A'], ['18 أمبير', '18 A'], ['25 أمبير', '25 A'], ['40 أمبير', '40 A'], ['65 أمبير', '65 A'], ['95 أمبير', '95 A'], ['150 أمبير', '150 A'], ['265 أمبير', '265 A']]],
    ['*', 'قاطع كهرباء', 'Circuit breaker', 'pc', [420, 24000], [['16 أمبير', '16 A'], ['32 أمبير', '32 A'], ['63 أمبير', '63 A'], ['100 أمبير', '100 A'], ['250 أمبير', '250 A'], ['400 أمبير', '400 A'], ['630 أمبير', '630 A']]],
    ['*', 'حساس حرارة PT100', 'PT100 temperature sensor', 'pc', [700, 1900], [['150 مم', '150 mm'], ['300 مم', '300 mm']]],
    ['*', 'كارت PLC', 'PLC module', 'pc', [9000, 42000], [['مدخلات رقمية', 'digital input'], ['مخرجات رقمية', 'digital output'], ['مدخلات تناظرية', 'analog input'], ['اتصال شبكة', 'network']]],
    ['*', 'كابل تحكم', 'Control cable', 'm', [35, 180], [['4×1.5 مم²', '4×1.5 mm²'], ['7×1.5 مم²', '7×1.5 mm²'], ['12×1.5 مم²', '12×1.5 mm²']]],
  ];

  function genSpareParts(assets) {
    var r = rng(5);
    var out = [];
    var typesPresent = {};
    assets.forEach(function (a) { typesPresent[a.type] = true; });
    partTemplates.forEach(function (tp) {
      tp[5].forEach(function (v) {
        var cost = round5(r.between(tp[4][0], tp[4][1]));
        var critical = cost > 40000 || tp[0] === 'kiln' || tp[0] === 'press' || tp[0] === 'printer';
        var min = critical ? r.int(1, 4) : r.int(2, 20);
        var onHand = r.chance(0.12) ? r.int(0, Math.max(0, min - 1)) : r.int(min, min * 3);
        out.push({
          id: 'SP-' + pad(out.length + 1, 4),
          name: b(tp[1] + ' — ' + v[0], tp[2] + ' — ' + v[1]),
          assetType: tp[0],
          unit: tp[3],
          unitCost: cost,
          critical: critical,
          minStock: min,
          onHand: onHand,
          bin: 'R' + pad(r.int(1, 18), 2) + '-' + String.fromCharCode(65 + r.int(0, 5)) + pad(r.int(1, 10), 2),
          supplierId: tp[0] === 'kiln' ? 'SUP-22' : tp[0] === 'polishing' || tp[0] === 'rectifier' ? 'SUP-26' : /bearing|رولمان/i.test(tp[2]) ? 'SUP-24' : /PLC|inverter|Contactor|breaker|sensor|motor|cable|board/i.test(tp[2]) ? 'SUP-25' : 'SUP-23',
          leadTimeDays: tp[0] === 'kiln' || tp[0] === 'printer' || tp[0] === 'polishing' ? r.int(30, 60) : r.int(2, 21),
        });
      });
    });
    // Filler variants of the most-consumed parts (seals, belts, bearings) up to the plan's ~300 lines.
    var fillers = [['رولمان بلي', 'Ball bearing', ['6305', '6306', '6307', '6309', '6311', '6313', '6314', '6315', '6316', '6317', '6318', '6319', '6320', '22210', '22212', '22214', '22218', '22222', '22224', '22226', '22228', '23120', '23122', '23124', '32210', '32212', '32214', '32216', 'NU 208', 'NU 210', 'NU 214', 'NU 216', 'UCP 205', 'UCP 206', 'UCP 210', 'UCP 212', 'UCF 205', 'UCF 206', 'UCF 208', 'UCF 212']],
      ['سير V', 'V-belt', ['SPA 1250', 'SPA 1500', 'SPA 1800', 'SPA 2000', 'SPA 2240', 'SPB 1600', 'SPB 2000', 'SPB 2500', 'SPB 2800', 'SPB 3550', 'SPC 3150', 'SPC 3550', 'SPC 4500', 'SPC 5600', 'B 58', 'B 64', 'B 72', 'B 80', 'C 90', 'C 105']],
      ['جوان O-ring', 'O-ring', ['20×3', '25×3', '32×3.5', '40×3.5', '50×4', '63×4', '80×5', '100×5', '125×5.3', '150×5.3', '180×7', '200×7', '250×7', '300×8', '350×8', '400×8']],
      ['خرطوم هيدروليك', 'Hydraulic hose', ['1/4 بوصة × 1 م', '3/8 بوصة × 1 م', '1/2 بوصة × 1 م', '3/4 بوصة × 1.5 م', '1 بوصة × 1.5 م', '1.25 بوصة × 2 م', '1.5 بوصة × 2 م', '2 بوصة × 2 م']],
      ['صمام كروي', 'Ball valve', ['1/2 بوصة', '3/4 بوصة', '1 بوصة', '1.5 بوصة', '2 بوصة', '3 بوصة', '4 بوصة']],
      ['جوان زيت', 'Oil seal', ['25×40×7', '30×47×7', '35×52×7', '40×55×8', '45×62×8', '50×68×8', '55×72×8', '60×80×8', '65×85×10', '70×90×10', '75×95×10', '80×100×10', '85×110×12', '90×110×12', '95×120×12', '100×125×12', '110×130×12', '120×150×15', '130×160×15', '140×170×15']],
      ['فيوز', 'Fuse', ['2 أمبير', '4 أمبير', '6 أمبير', '10 أمبير', '16 أمبير', '25 أمبير', '32 أمبير', '63 أمبير', '100 أمبير', '160 أمبير']],
      ['ريليه', 'Relay', ['24V DC — 2CO', '24V DC — 4CO', '230V AC — 2CO', '230V AC — 4CO', 'Timer 24V', 'Timer 230V', 'Safety relay', 'SSR 40A']],
      ['سلندر هوائي', 'Pneumatic cylinder', ['Ø32×50', 'Ø32×100', 'Ø40×150', 'Ø50×100', 'Ø50×200', 'Ø63×250', 'Ø80×300', 'Ø100×320']],
      ['صمام هوائي', 'Pneumatic solenoid valve', ['5/2 — 1/4"', '5/2 — 3/8"', '5/3 — 1/4"', '5/3 — 3/8"', '3/2 — 1/8"', '3/2 — 1/4"']]];
    fillers.forEach(function (f) {
      f[2].forEach(function (v) {
        if (out.length >= 300) return;
        var cost = round5(r.between(120, 3800));
        var min = r.int(2, 16);
        var enV = v.replace(/بوصة/g, 'inch').replace(/أمبير/g, 'A').replace(/م$/, 'm');
        out.push({
          id: 'SP-' + pad(out.length + 1, 4),
          name: b(f[0] + ' — ' + v, f[1] + ' — ' + enV),
          assetType: '*', unit: 'pc', unitCost: cost, critical: false, minStock: min,
          onHand: r.chance(0.1) ? r.int(0, min - 1) : r.int(min, min * 3),
          bin: 'R' + pad(r.int(1, 18), 2) + '-' + String.fromCharCode(65 + r.int(0, 5)) + pad(r.int(1, 10), 2),
          supplierId: f[1] === 'Ball bearing' || f[1] === 'V-belt' ? 'SUP-24' : 'SUP-23', leadTimeDays: r.int(2, 14),
        });
      });
    });
    out.forEach(function (p) { if (p.assetType !== '*' && !typesPresent[p.assetType]) throw new Error('Spare part for unknown asset type ' + p.assetType); });
    return out;
  }

  // ---------------------------------------------------------------- people
  // [id, ar, en, headcount, shiftBased, femaleRatio, titles: [ar, en, weight]]
  var departmentRows = [
    ['D01', 'الإدارة العليا', 'Executive management', 6, false, 0.3, [['رئيس مجلس الإدارة', 'Chairman', 0], ['المدير العام', 'General manager', 0], ['مدير المصنع', 'Plant manager', 0], ['المدير المالي والإداري', 'Finance & admin director', 0], ['مساعد المدير العام', 'Assistant GM', 0], ['سكرتارية تنفيذية', 'Executive secretary', 0]]],
    ['D02', 'الإنتاج', 'Production', 196, true, 0.02, [['مدير الإنتاج', 'Production manager', 0], ['مهندس إنتاج', 'Production engineer', 6], ['مشرف وردية', 'Shift supervisor', 9], ['مشغل مكبس', 'Press operator', 18], ['مشغل مجفف', 'Dryer operator', 9], ['مشغل خط طلاء', 'Glaze-line operator', 24], ['مشغل طابعة ديجيتال', 'Digital printer operator', 12], ['مشغل فرن', 'Kiln operator', 18], ['عامل خط', 'Line worker', 90], ['مشغل خط تلميع', 'Polishing operator', 9]]],
    ['D03', 'تحضير الخامات', 'Body preparation', 35, true, 0.0, [['رئيس قسم التحضير', 'Body-prep head', 0], ['مشرف طواحين', 'Mills supervisor', 3], ['مشغل طاحونة', 'Mill operator', 12], ['مشغل أتومايزر', 'Atomizer operator', 6], ['عامل تغذية خامات', 'Raw-material feeder', 10], ['سائق لودر', 'Loader driver', 3]]],
    ['D04', 'الجليز والتصميم', 'Glaze & design', 25, true, 0.3, [['رئيس قسم الجليز', 'Glaze head', 0], ['مصمم جرافيك سيراميك', 'Ceramic graphic designer', 4], ['فني جليز', 'Glaze technician', 9], ['مشغل طاحونة جليز', 'Glaze mill operator', 6], ['فني ألوان وأحبار', 'Colour & ink technician', 5]]],
    ['D05', 'الفرز والتعبئة', 'Sorting & packing', 80, true, 0.12, [['رئيس قسم الفرز', 'Sorting head', 0], ['مشرف فرز', 'Sorting supervisor', 6], ['عامل فرز', 'Sorter', 40], ['عامل تعبئة', 'Packer', 24], ['مشغل روبوت رص', 'Palletizer operator', 9]]],
    ['D06', 'الجودة والمعمل', 'Quality & lab', 20, true, 0.4, [['مدير الجودة', 'Quality manager', 0], ['مهندس جودة', 'Quality engineer', 3], ['فني معمل', 'Lab technician', 10], ['مفتش جودة خط', 'Line quality inspector', 6]]],
    ['D07', 'المخازن', 'Warehouses', 30, true, 0.05, [['مدير المخازن', 'Warehouse manager', 0], ['أمين مخزن', 'Storekeeper', 9], ['مساعد أمين مخزن', 'Assistant storekeeper', 8], ['سائق كلارك', 'Forklift driver', 12]]],
    ['D08', 'المبيعات', 'Sales', 22, false, 0.25, [['مدير المبيعات', 'Sales manager', 0], ['مندوب مبيعات', 'Sales representative', 0], ['مسؤول خدمة عملاء', 'Customer-service officer', 5], ['موظف معرض', 'Showroom staff', 5], ['مسؤول تصدير', 'Export officer', 2], ['محاسب مبيعات', 'Sales accountant', 2]]],
    ['D09', 'التوزيع والشحن', 'Distribution & shipping', 25, true, 0.0, [['مسؤول الحركة', 'Traffic manager', 0], ['منسق تحميل', 'Loading coordinator', 4], ['عامل تحميل', 'Loader', 14], ['سائق نقل ثقيل', 'Truck driver', 6]]],
    ['D10', 'المشتريات', 'Purchasing', 6, false, 0.3, [['مدير المشتريات', 'Purchasing manager', 0], ['أخصائي مشتريات', 'Buyer', 3], ['مسؤول استيراد', 'Import officer', 2]]],
    ['D11', 'الصيانة والمرافق', 'Maintenance & utilities', 55, true, 0.0, [['مدير الصيانة', 'Maintenance manager', 0], ['مهندس ميكانيكا', 'Mechanical engineer', 4], ['مهندس كهرباء', 'Electrical engineer', 4], ['فني ميكانيكا', 'Mechanical technician', 18], ['فني كهرباء', 'Electrical technician', 14], ['فني تحكم آلي', 'Automation technician', 6], ['فني مرافق', 'Utilities technician', 8]]],
    ['D12', 'الموارد البشرية', 'Human resources', 6, false, 0.5, [['مدير الموارد البشرية', 'HR manager', 0], ['أخصائي شؤون عاملين', 'Personnel specialist', 3], ['مسؤول حضور وانصراف', 'Time & attendance officer', 2]]],
    ['D13', 'المالية والتكاليف', 'Finance & costing', 10, false, 0.5, [['رئيس الحسابات', 'Chief accountant', 0], ['محاسب تكاليف', 'Cost accountant', 3], ['محاسب', 'Accountant', 3], ['مسؤول تحصيل', 'Collections officer', 3]]],
    ['D14', 'السلامة والبيئة', 'Health, safety & environment', 4, true, 0.0, [['مسؤول السلامة', 'HSE officer', 0], ['مشرف سلامة', 'Safety supervisor', 3]]],
  ];

  var REGIONS = {
    upperNorth: b('شمال الصعيد', 'Northern Upper Egypt'), upperSouth: b('جنوب الصعيد', 'Southern Upper Egypt'),
    cairo: b('القاهرة', 'Cairo'), gizaQal: b('الجيزة والقليوبية', 'Giza & Qalyubia'), delta: b('الدلتا', 'Delta'),
    alexCanal: b('الإسكندرية والقناة', 'Alexandria & Canal'), export: b('التصدير', 'Export'),
  };

  function genPeople() {
    var r = rng(6);
    var departments = departmentRows.map(function (d) { return { id: d[0], name: b(d[1], d[2]), headcount: d[3], shiftBased: d[4] }; });
    var employees = [];
    departmentRows.forEach(function (d) {
      var titles = d[6];
      var expanded = [];
      expanded.push(titles[0]);
      titles.slice(1).forEach(function (t) { for (var k = 0; k < t[2]; k++) expanded.push(t); });
      if (d[0] === 'D01') expanded = titles.slice();
      if (d[0] === 'D08') {
        // Eight representatives, one per sales region.
        for (var s = 0; s < 8; s++) expanded.splice(1, 0, titles[1]);
      }
      // Pad or trim the lowest-skill role so the department matches its headcount exactly.
      while (expanded.length < d[3]) expanded.push(titles[titles.length - 1]);
      expanded = expanded.slice(0, d[3]);
      expanded.forEach(function (t, idx) {
        var gender = idx === 0 && d[0] !== 'D12' && d[0] !== 'D13' ? 'M' : r.chance(d[5]) ? 'F' : 'M';
        var isHead = idx === 0;
        var shift = !d[4] || isHead ? 'D' : ['A', 'B', 'C'][idx % 3];
        var level = isHead || /manager|director|chairman|assistant gm/i.test(t[1]) ? 'manager' : /Engineer|secretary|designer|specialist|officer|accountant|representative|Buyer/i.test(t[1]) ? 'professional' : /مشرف|supervisor|head|رئيس/i.test(t[0] + t[1]) ? 'supervisor' : /فني|technician/i.test(t[1]) ? 'technician' : 'worker';
        var e = {
          id: 'EMP-' + pad(employees.length + 1, 4),
          name: personName(r, gender),
          gender: gender,
          departmentId: d[0],
          title: b(t[0], t[1]),
          level: level,
          shift: shift,
          hireDate: isHead ? r.date(2012, '2020-12-31') : r.date(2012, '2026-08-31'),
          status: 'active',
        };
        if (d[0] === 'D02') e.line = ['L1', 'L2', 'L3'][Math.floor(idx / 3) % 3];
        employees.push(e);
      });
    });
    // A few people on leave or suspended, so HR screens are not all green.
    for (var i = 0; i < 9; i++) employees[r.int(20, employees.length - 1)].status = 'onLeave';
    for (i = 0; i < 2; i++) employees[r.int(20, employees.length - 1)].status = 'suspended';

    var regionKeys = ['upperNorth', 'upperSouth', 'cairo', 'cairo', 'gizaQal', 'delta', 'alexCanal', 'export'];
    var reps = employees.filter(function (e) { return e.departmentId === 'D08' && e.title.en === 'Sales representative'; })
      .map(function (e, idx) { e.region = regionKeys[idx]; return { employeeId: e.id, region: regionKeys[idx] }; });
    return { departments: departments, employees: employees, reps: reps };
  }

  // ---------------------------------------------------------------- dealers
  var GOVS = [
    ['بني سويف', 'Beni Suef', 'upperNorth', 8], ['المنيا', 'Minya', 'upperNorth', 7], ['الفيوم', 'Fayoum', 'upperNorth', 5],
    ['أسيوط', 'Assiut', 'upperSouth', 6], ['سوهاج', 'Sohag', 'upperSouth', 4], ['قنا', 'Qena', 'upperSouth', 3], ['الأقصر', 'Luxor', 'upperSouth', 1], ['أسوان', 'Aswan', 'upperSouth', 2],
    ['القاهرة', 'Cairo', 'cairo', 9], ['الجيزة', 'Giza', 'gizaQal', 8], ['القليوبية', 'Qalyubia', 'gizaQal', 3],
    ['الغربية', 'Gharbia', 'delta', 3], ['الدقهلية', 'Dakahlia', 'delta', 3], ['الشرقية', 'Sharqia', 'delta', 3], ['المنوفية', 'Menoufia', 'delta', 2], ['البحيرة', 'Beheira', 'delta', 1],
    ['الإسكندرية', 'Alexandria', 'alexCanal', 3], ['الإسماعيلية', 'Ismailia', 'alexCanal', 1], ['السويس', 'Suez', 'alexCanal', 1], ['بورسعيد', 'Port Said', 'alexCanal', 1],
    ['ليبيا', 'Libya', 'export', 3], ['السودان', 'Sudan', 'export', 2], ['السعودية', 'Saudi Arabia', 'export', 1],
  ];
  var DEALER_ROOTS = [
    ['الأمل', 'Al-Amal'], ['الفتح', 'Al-Fath'], ['النصر', 'Al-Nasr'], ['الهدى', 'Al-Hoda'], ['الرحمة', 'Al-Rahma'], ['النور', 'Al-Nour'],
    ['السلام', 'Al-Salam'], ['الإخلاص', 'Al-Ikhlas'], ['البركة', 'Al-Baraka'], ['الفجر', 'Al-Fagr'], ['الشروق', 'Al-Shorouk'], ['الصفا', 'Al-Safa'],
    ['المروة', 'Al-Marwa'], ['الرضا', 'Al-Reda'], ['الجوهرة', 'Al-Gawhara'], ['الماسة', 'Al-Masa'], ['القمة', 'Al-Qemma'], ['الريان', 'Al-Rayan'],
    ['السعادة', 'Al-Saada'], ['المستقبل', 'Al-Mostaqbal'], ['الكوثر', 'Al-Kawthar'], ['الإيمان', 'Al-Iman'], ['الوفاء', 'Al-Wafaa'], ['الأصدقاء', 'Al-Asdiqaa'],
    ['الحرمين', 'Al-Haramein'], ['التقوى', 'Al-Taqwa'], ['العربي', 'Al-Araby'], ['الزهراء', 'Al-Zahraa'], ['النخيل', 'Al-Nakheel'], ['الياسمين', 'Al-Yasmeen'],
  ];
  var DEALER_TYPES = {
    showroom: b('معرض تجزئة', 'Retail showroom'), wholesale: b('تاجر جملة', 'Wholesaler'), distributor: b('موزع معتمد', 'Authorised distributor'),
    contractor: b('مقاول', 'Contractor'), project: b('مشروع', 'Project'), export: b('مستورد خارجي', 'Export importer'),
  };
  var EXPORT_NAMES = [
    ['طرابلس لمواد البناء', 'Tripoli Building Materials Co.'], ['بنغازي للسيراميك والرخام', 'Benghazi Ceramics & Marble'], ['مصراتة للتجارة العامة', 'Misrata General Trading'],
    ['الخرطوم لتجارة السيراميك', 'Khartoum Ceramics Trading'], ['بورتسودان للاستيراد', 'Port Sudan Imports'], ['جدة لتجارة البلاط', 'Jeddah Tiles Trading'],
  ];

  function genDealers(reps) {
    var r = rng(7);
    var dealers = [], used = {}, exportIdx = 0;
    var repByRegion = {};
    reps.forEach(function (rp) { (repByRegion[rp.region] = repByRegion[rp.region] || []).push(rp.employeeId); });
    GOVS.forEach(function (g) {
      for (var k = 0; k < g[3]; k++) {
        var type, name;
        if (g[2] === 'export') {
          type = 'export';
          name = b(EXPORT_NAMES[exportIdx][0], EXPORT_NAMES[exportIdx][1]);
          exportIdx++;
        } else {
          type = r.weighted([['showroom', 40], ['wholesale', 25], ['distributor', 12], ['contractor', 15], ['project', 8]]);
          var root;
          do { root = r.pick(DEALER_ROOTS); } while (used[root[0] + g[0] + type]);
          used[root[0] + g[0] + type] = true;
          if (type === 'showroom') name = b('معرض ' + root[0] + ' للسيراميك', root[1] + ' Ceramics Showroom');
          else if (type === 'wholesale') name = b('مؤسسة ' + root[0] + ' لمواد البناء', root[1] + ' Building Materials');
          else if (type === 'distributor') name = b(root[0] + ' للتجارة والتوزيع', root[1] + ' Trading & Distribution');
          else if (type === 'contractor') name = b('شركة ' + root[0] + ' للمقاولات', root[1] + ' Contracting Co.');
          else name = b('مشروع إسكان ' + root[0] + ' — ' + g[0], root[1] + ' Housing Project — ' + g[1]);
        }
        var limits = { showroom: [250000, 900000], wholesale: [900000, 3500000], distributor: [2000000, 6000000], contractor: [400000, 2500000], project: [1000000, 5000000], export: [0, 0] };
        var lim = limits[type];
        var credit = type === 'export' ? 0 : Math.round(r.between(lim[0], lim[1]) / 50000) * 50000;
        var reg = repByRegion[g[2]] || [];
        var terms = type === 'export' ? 0 : type === 'showroom' ? r.pick([0, 15, 30]) : r.pick([30, 45, 60, 90]);
        var annual = { showroom: [8000, 40000], wholesale: [40000, 160000], distributor: [100000, 320000], contractor: [15000, 90000], project: [30000, 180000], export: [40000, 200000] }[type];
        dealers.push({
          id: 'DL-' + pad(dealers.length + 1, 3),
          name: name,
          type: type,
          governorate: b(g[0], g[1]),
          region: g[2],
          repId: reg.length ? reg[dealers.length % reg.length] : null,
          creditLimit: credit,
          paymentTermsDays: terms,
          paymentMethod: type === 'export' ? b('اعتماد مستندي', 'Letter of credit') : terms === 0 ? b('نقدي', 'Cash') : b('آجل', 'Credit'),
          priceList: type === 'export' ? 'EXP' : g[2] === 'cairo' || g[2] === 'gizaQal' ? 'CAI' : g[2].indexOf('upper') === 0 ? 'UPR' : 'DLT',
          class: r.weighted([['A', 2], ['B', 4], ['C', 4]]),
          annualTargetM2: Math.round(r.between(annual[0], annual[1]) / 500) * 500,
          since: r.int(2013, 2026),
          status: 'active',
        });
      }
    });
    // Realism the demo script relies on: one large dealer on credit hold, two dormant accounts.
    var hold = dealers.filter(function (d) { return d.type === 'distributor' && d.region === 'upperSouth'; })[0] || dealers[20];
    hold.status = 'creditHold';
    dealers[57].status = 'inactive';
    dealers[33].status = 'inactive';
    return dealers;
  }

  var priceLists = [
    { id: 'UPR', name: b('قائمة الصعيد', 'Upper Egypt list'), factor: 0.97 },
    { id: 'CAI', name: b('قائمة القاهرة والجيزة', 'Cairo & Giza list'), factor: 1.0 },
    { id: 'DLT', name: b('قائمة الدلتا والقناة', 'Delta & Canal list'), factor: 0.99 },
    { id: 'EXP', name: b('قائمة التصدير (دولار)', 'Export list (USD)'), factor: 0.9, currency: 'USD' },
  ];

  // ---------------------------------------------------------------- codes & standards
  var codes = {
    defects: [
      ['DF01', 'ثقوب دبوسية', 'Pinholes', 'glaze'], ['DF02', 'شروخ', 'Cracks', 'body'], ['DF03', 'اختلاف درجة اللون', 'Shade variation', 'kiln'],
      ['DF04', 'تقوّس / عدم استواء', 'Warpage / planarity', 'kiln'], ['DF05', 'حواف مكسورة', 'Chipped edges', 'handling'], ['DF06', 'بقع', 'Spots', 'glaze'],
      ['DF07', 'انكماش الجليز', 'Glaze crawling', 'glaze'], ['DF08', 'فقاعات', 'Blisters', 'kiln'], ['DF09', 'خطوط طباعة (فوهة مسدودة)', 'Print lines (clogged nozzle)', 'print'],
      ['DF10', 'اختلاف المقاس (كاليبر)', 'Caliber deviation', 'press'], ['DF11', 'خدوش', 'Scratches', 'handling'], ['DF12', 'تشرخ الجليز', 'Crazing', 'glaze'],
      ['DF13', 'اتساخ', 'Dirt', 'handling'], ['DF14', 'اختلاف السُمك', 'Thickness variation', 'press'],
    ].map(function (x) { return { id: x[0], name: b(x[1], x[2]), source: x[3] }; }),
    defectSources: { glaze: b('الجليز', 'Glaze'), body: b('الجسم', 'Body'), kiln: b('الفرن', 'Kiln'), handling: b('النقل والتداول', 'Handling'), print: b('الطباعة', 'Printing'), press: b('المكبس', 'Press') },
    downtime: [
      ['DT01', 'عطل ميكانيكي', 'Mechanical breakdown', 'breakdown', false], ['DT02', 'عطل كهربائي', 'Electrical breakdown', 'breakdown', false],
      ['DT03', 'عطل تحكم آلي', 'Automation fault', 'breakdown', false], ['DT04', 'تغيير مقاس', 'Size changeover', 'changeover', true],
      ['DT05', 'تغيير تصميم', 'Design changeover', 'changeover', true], ['DT06', 'نقص بودرة', 'Powder shortage', 'material', false],
      ['DT07', 'نقص جليز أو حبر', 'Glaze or ink shortage', 'material', false], ['DT08', 'انتظار قرار جودة', 'Waiting for quality decision', 'quality', false],
      ['DT09', 'انقطاع كهرباء', 'Power cut', 'utility', false], ['DT10', 'انخفاض ضغط الغاز', 'Gas pressure drop', 'utility', false],
      ['DT11', 'صيانة وقائية مخططة', 'Planned preventive maintenance', 'planned', true], ['DT12', 'نظافة الخط', 'Line cleaning', 'planned', true],
      ['DT13', 'نقص عمالة', 'Labour shortage', 'people', false], ['DT14', 'امتلاء المخزن التام', 'Finished-goods store full', 'logistics', false],
      ['DT15', 'انتظار مواد تعبئة', 'Waiting for packaging', 'material', false], ['DT16', 'توقف لعدم وجود طلبيات', 'Stopped — no orders', 'planned', true],
    ].map(function (x) { return { id: x[0], name: b(x[1], x[2]), category: x[3], planned: x[4] }; }),
    downtimeCategories: {
      breakdown: b('أعطال', 'Breakdowns'), changeover: b('تغيير', 'Changeovers'), material: b('نقص مواد', 'Material shortage'), quality: b('جودة', 'Quality'),
      utility: b('مرافق', 'Utilities'), planned: b('مخطط', 'Planned'), people: b('عمالة', 'People'), logistics: b('لوجستيات', 'Logistics'),
    },
    // [id, ar, en, stage, standard, unit, spec by family {porcelain,floor,wall} as [min,max] (null = n/a)]
    tests: [
      ['QT01', 'امتصاص المياه', 'Water absorption', 'finished', 'ISO 10545-3', '%', { porcelain: [null, 0.5], floor: [3, 6], wall: [10, 20] }],
      ['QT02', 'قوة الكسر', 'Breaking strength', 'finished', 'ISO 10545-4', 'N', { porcelain: [1300, null], floor: [1000, null], wall: [600, null] }],
      ['QT03', 'معامل الكسر', 'Modulus of rupture', 'finished', 'ISO 10545-4', 'N/mm²', { porcelain: [35, null], floor: [22, null], wall: [15, null] }],
      ['QT04', 'انحراف الأبعاد', 'Dimensional deviation', 'finished', 'ISO 10545-2', '%', { porcelain: [-0.6, 0.6], floor: [-0.6, 0.6], wall: [-0.5, 0.5] }],
      ['QT05', 'الاستواء (انحناء المركز)', 'Centre curvature', 'finished', 'ISO 10545-2', '%', { porcelain: [-0.5, 0.5], floor: [-0.5, 0.5], wall: [-0.3, 0.5] }],
      ['QT06', 'مقاومة التشرخ', 'Crazing resistance', 'finished', 'ISO 10545-11', b('نجاح/رسوب', 'pass/fail'), { porcelain: null, floor: null, wall: null }],
      ['QT07', 'مقاومة الكيماويات', 'Chemical resistance', 'finished', 'ISO 10545-13', b('درجة', 'class'), { porcelain: null, floor: null, wall: null }],
      ['QT08', 'مقاومة البقع', 'Stain resistance', 'finished', 'ISO 10545-14', b('درجة', 'class'), { porcelain: [3, null], floor: [3, null], wall: [3, null] }],
      ['QT09', 'مقاومة التآكل (PEI)', 'Abrasion resistance (PEI)', 'finished', 'ISO 10545-7', b('درجة', 'class'), { porcelain: null, floor: [3, null], wall: null }],
      ['QT10', 'كثافة الروبة', 'Slip density', 'process', b('داخلي', 'internal'), 'g/L', { porcelain: [1690, 1720], floor: [1680, 1710], wall: [1670, 1700] }],
      ['QT11', 'متبقي منخل 63 ميكرون', 'Residue on 63 µm sieve', 'process', b('داخلي', 'internal'), '%', { porcelain: [0.8, 1.5], floor: [1.5, 2.5], wall: [2.0, 3.0] }],
      ['QT12', 'رطوبة البودرة', 'Powder moisture', 'process', b('داخلي', 'internal'), '%', { porcelain: [5.8, 6.4], floor: [5.5, 6.2], wall: [5.6, 6.5] }],
      ['QT13', 'الكثافة الخضراء', 'Green bulk density', 'process', b('داخلي', 'internal'), 'g/cm³', { porcelain: [1.98, 2.04], floor: [1.95, 2.02], wall: [1.90, 1.98] }],
      ['QT14', 'رطوبة الخامة الواردة', 'Incoming raw-material moisture', 'incoming', b('داخلي', 'internal'), '%', { porcelain: [null, 12], floor: [null, 12], wall: [null, 12] }],
      ['QT15', 'درجة اللون ΔE', 'Shade ΔE', 'finished', b('داخلي', 'internal'), 'ΔE', { porcelain: [null, 1.0], floor: [null, 1.2], wall: [null, 1.0] }],
    ].map(function (x) { return { id: x[0], name: b(x[1], x[2]), stage: x[3], standard: x[4], unit: x[5], spec: x[6] }; }),
    testStages: { finished: b('منتج تام', 'Finished product'), process: b('أثناء التشغيل', 'In process'), incoming: b('خامات واردة', 'Incoming materials') },
  };

  // ---------------------------------------------------------------- assemble
  function generate() {
    var products = genProducts();
    var materials = genMaterials();
    var recipes = genRecipes();
    var suppliers = genSuppliers(materials);
    var assets = genAssets();
    var spareParts = genSpareParts(assets);
    var people = genPeople();
    var dealers = genDealers(people.reps);
    // Warehouse managers are real employees of the warehouse department.
    var storekeepers = people.employees.filter(function (e) { return e.departmentId === 'D07' && (e.level === 'manager' || e.title.en === 'Storekeeper'); });
    var whs = warehouses.map(function (w, i) { var c = JSON.parse(JSON.stringify(w)); c.keeperId = storekeepers[i % storekeepers.length].id; return c; });

    var db = {
      version: 'A1',
      seed: SEED,
      referenceDate: REFERENCE_DATE,
      company: company, sites: sites, lines: lines, families: families, sizes: sizes, finishes: finishes, designs: designs, grades: grades,
      priceLists: priceLists, products: products,
      materialCategories: MATERIAL_CATEGORIES, units: UNITS, origins: ORIGINS, materials: materials, recipes: recipes,
      warehouses: whs, supplierCategories: SUPPLIER_CATEGORIES, suppliers: suppliers,
      assetTypes: ASSET_TYPES, areas: AREAS, assets: assets, spareParts: spareParts,
      departments: people.departments, employees: people.employees, reps: people.reps, regions: REGIONS,
      dealerTypes: DEALER_TYPES, dealers: dealers,
      codes: codes,
    };
    db.counts = {
      products: products.length, materials: materials.length, bodyRecipes: recipes.body.length, glazeRecipes: recipes.glaze.length,
      warehouses: whs.length, suppliers: suppliers.length, assets: assets.length, spareParts: spareParts.length,
      departments: people.departments.length, employees: people.employees.length, dealers: dealers.length,
      defects: codes.defects.length, downtime: codes.downtime.length, tests: codes.tests.length,
    };
    return db;
  }

  root.CeramicData = { generate: generate, SEED: SEED, REFERENCE_DATE: REFERENCE_DATE };
})(globalThis);
