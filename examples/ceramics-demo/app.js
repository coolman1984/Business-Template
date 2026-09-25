/* Ceramica Nova demo — phase A1: shell, navigation, master data. Needs data.js loaded first. */
(function () {
  'use strict';

  var DB = globalThis.CeramicData.generate();
  var PAGE_SIZE = 25;

  // ================================================================ i18n
  var UI = {
    ar: {
      'brand.sub': 'نظام إدارة المصنع', 'demo.note': 'نموذج عرض — كل الأسماء والأرقام هنا تجريبية ولا تخص أي مصنع حقيقي.', 'demo.tag': 'نموذج',
      'theme': 'تبديل المظهر', 'menu': 'القائمة', 'signOut': 'خروج', 'signIn': 'دخول', 'login.title': 'تسجيل الدخول', 'login.hint': 'نسخة تجريبية — اضغط دخول.',
      'login.email': 'البريد الإلكتروني', 'login.password': 'كلمة المرور', 'back': 'رجوع', 'close': 'إغلاق',
      'g.overview': 'نظرة عامة', 'g.production': 'الإنتاج', 'g.quality': 'الجودة', 'g.commercial': 'التجارة والمخازن', 'g.support': 'الدعم', 'g.master': 'البيانات الأساسية',
      'phase': 'الدفعة {p}', 'ready': 'جاهز', 'all': 'الكل', 'search': 'بحث بالاسم أو الكود…', 'count': '{shown} من {total}', 'pageOf': 'صفحة {p} من {n}',
      'prev': 'السابق', 'next': 'التالي', 'empty': 'مفيش نتائج مطابقة. جرّب تشيل فلتر.', 'egp': 'ج.م', 'perM2': 'ج.م/م²', 'yes': 'نعم', 'no': 'لا',
      'planned.lead': 'الشاشة دي هتتبني في الدفعة {p}. ده اللي هيبقى فيها حسب الخطة:', 'planned.screens': 'الشاشات المخططة', 'planned.kpis': 'المؤشرات في لوحتها',
      'planned.ready': 'البيانات الأساسية الجاهزة اللي هتعتمد عليها', 'open': 'افتح',
      // profile
      'profile.title': 'ملف المصنع', 'profile.founded': 'تأسس {y}', 'profile.capDay': 'م² طاقة يومية', 'profile.capYear': 'مليون م² سنويًا', 'profile.lines': 'خطوط إنتاج',
      'profile.employees': 'عامل وموظف', 'profile.products': 'منتج', 'profile.dealers': 'تاجر وعميل', 'profile.suppliers': 'مورد', 'profile.assets': 'معدة',
      'profile.linesTitle': 'خطوط الإنتاج والأفران', 'profile.capacity': 'الطاقة اليومية', 'profile.kiln': 'الفرن', 'profile.kilnSpec': '{len} م · دورة {cyc} دقيقة · حتى {temp}°م',
      'profile.sizes': 'المقاسات', 'profile.packing': 'التعبئة لكل مقاس', 'profile.packNote': 'البيع بالمتر المربع، والتخزين بالكرتونة، والتحميل بالباليتة — والتحويل بينهم من الجدول ده.',
      'profile.shifts': 'الورديات', 'profile.sites': 'المواقع والمخازن', 'profile.roadmap': 'مسار بناء النموذج', 'profile.now': 'دلوقتي',
      'profile.families': 'تشكيلة المنتجات',
      'rm.A1': 'البيانات الأساسية والهيكل والتنقل', 'rm.A2': 'لوحات الإدارة العليا والإنتاج والجودة', 'rm.A3': 'التخطيط والتحضير والجليز والخطوط والفرز والمعمل',
      'rm.A4': 'المخازن والمنتج التام بدرجات اللون، المبيعات والتوزيع', 'rm.A5': 'المشتريات، الصيانة، الطاقة، العاملين، التكاليف، السلامة', 'rm.A6': 'الاستيراد من إكسيل، شاشات التابلت، سيناريو العرض',
      // columns
      'c.code': 'الكود', 'c.name': 'الاسم', 'c.family': 'العائلة', 'c.size': 'المقاس', 'c.finish': 'التشطيب', 'c.line': 'الخط', 'c.g1': 'فرز أول', 'c.g2': 'تجاري', 'c.cost': 'التكلفة المعيارية',
      'c.status': 'الحالة', 'c.category': 'الفئة', 'c.unit': 'الوحدة', 'c.origin': 'المنشأ', 'c.supplier': 'المورد', 'c.stdCost': 'تكلفة الوحدة', 'c.minStock': 'حد الطلب', 'c.lead': 'مدة التوريد',
      'c.type': 'النوع', 'c.version': 'الإصدار', 'c.effective': 'ساري من', 'c.items': 'المكونات', 'c.usedBy': 'منتجات', 'c.area': 'المكان', 'c.maker': 'الصانع والموديل', 'c.year': 'سنة التركيب',
      'c.crit': 'الأهمية', 'c.pm': 'الصيانة الوقائية', 'c.for': 'للمعدة', 'c.stock': 'الرصيد / الحد', 'c.bin': 'الموقع', 'c.site': 'الموقع', 'c.keeper': 'أمين المخزن', 'c.locations': 'أماكن التخزين',
      'c.capacity': 'السعة', 'c.areaM2': 'المساحة م²', 'c.country': 'الدولة', 'c.terms': 'شروط الدفع', 'c.rating': 'التقييم', 'c.gov': 'المحافظة', 'c.region': 'المنطقة', 'c.rep': 'المندوب',
      'c.credit': 'حد الائتمان', 'c.class': 'الفئة', 'c.dept': 'القسم', 'c.title': 'الوظيفة', 'c.shift': 'الوردية', 'c.hired': 'تاريخ التعيين', 'c.stage': 'المرحلة', 'c.standard': 'المعيار',
      'c.source': 'مصدر العيب', 'c.level': 'المستوى', 'pm.unit.hours': 'ساعة', 'pm.unit.strokes': 'كبسة', 'pm.overdue': 'متأخرة', 'pm.atMeter': 'عند {n} {u}', 'c.planned': 'مخطط؟', 'c.days': '{n} يوم', 'c.target': 'المستهدف السنوي',
      // statuses
      's.active': 'نشط', 's.new': 'جديد', 's.discontinued': 'متوقف', 's.running': 'شغال', 's.maintenance': 'في الصيانة', 's.standby': 'احتياطي', 's.onLeave': 'إجازة', 's.suspended': 'موقوف',
      's.creditHold': 'موقوف ائتمانيًا', 's.inactive': 'غير نشط', 's.belowMin': 'تحت الحد', 's.ok': 'كافي', 's.critical': 'حرجة',
      'pm.hours': 'كل {n} ساعة تشغيل', 'pm.strokes': 'كل {n} كبسة', 'pm.calendar': 'كل {n} يوم',
      'lvl.manager': 'مدير', 'lvl.professional': 'أخصائي/مهندس', 'lvl.supervisor': 'مشرف', 'lvl.technician': 'فني', 'lvl.worker': 'عامل',
      'origin.local': 'محلي', 'origin.imported': 'مستورد', 'cash': 'نقدي', 'body': 'جسم', 'glaze': 'جليز', 'anyEquipment': 'كل المعدات (عام)',
      // pages
      'p.products': 'المنتجات', 'p.products.sub': 'كل تصميم بمقاسه وتشطيبه، بأسعار كل فرز وتكلفته المعيارية.',
      'p.materials': 'الخامات والمواد', 'p.materials.sub': 'خامات الجسم والفريت والجليز والأحبار ومواد التعبئة والكيماويات والمستهلكات.',
      'p.recipes': 'التركيبات', 'p.recipes.sub': 'تركيبات الجسم والجليز بالنسب والإصدارات، والقيم المستهدفة في المعمل.',
      'p.assets': 'المعدات', 'p.assets.sub': 'كل معدة في المصنع وخطتها في الصيانة الوقائية.',
      'p.spareParts': 'قطع الغيار', 'p.spareParts.sub': 'قطع غيار المعدات بأرصدتها وحد الطلب ومكانها في المخزن.',
      'p.warehouses': 'المخازن', 'p.warehouses.sub': 'المخازن السبعة في المصنع والقاهرة.',
      'p.suppliers': 'الموردين', 'p.suppliers.sub': 'موردين الخامات والفريت والأحبار والتعبئة وقطع الغيار.',
      'p.dealers': 'التجار والعملاء', 'p.dealers.sub': 'التجار والموزعين والمقاولين والمشروعات والتصدير، بحدود الائتمان والمناديب.',
      'p.employees': 'العاملين', 'p.employees.sub': 'العاملين بأقسامهم ووظائفهم ووردياتهم.',
      'p.codes': 'الأكواد والمعايير', 'p.codes.sub': 'أكواد العيوب وأسباب التوقف واختبارات الجودة ومواصفاتها.',
      'tab.defects': 'أكواد العيوب', 'tab.downtime': 'أسباب التوقف', 'tab.tests': 'اختبارات الجودة',
      // drawer
      'd.packing': 'التعبئة', 'd.pcsBox': 'بلاطة في الكرتونة', 'd.m2Box': 'م² في الكرتونة', 'd.kgBox': 'وزن الكرتونة', 'd.boxesPallet': 'كرتونة في الباليتة', 'd.m2Pallet': 'م² في الباليتة',
      'd.thickness': 'السُمك', 'd.prices': 'الأسعار حسب الفرز وقائمة الأسعار', 'd.perBox': 'للكرتونة', 'd.margin': 'هامش الفرز الأول', 'd.production': 'الإنتاج',
      'd.bodyRecipe': 'تركيبة الجسم', 'd.glazeRecipe': 'تركيبة الجليز', 'd.faces': 'وجوه التصميم', 'd.ink': 'حبر', 'd.glazeWeight': 'جليز', 'd.absorption': 'مجموعة الامتصاص (ISO 13006)',
      'd.pei': 'مقاومة التآكل', 'd.slip': 'مقاومة الانزلاق', 'd.launched': 'بداية الإنتاج', 'd.usedIn': 'مستخدمة في التركيبات', 'd.composition': 'التركيب', 'd.targets': 'القيم المستهدفة',
      'd.additives': 'إضافات', 'd.productsUsing': 'المنتجات اللي بتستخدمها', 'd.pmPlan': 'خطة الصيانة الوقائية', 'd.meter': 'العداد الحالي', 'd.lastPm': 'آخر صيانة', 'd.nextPm': 'الصيانة الجاية',
      'd.parts': 'قطع الغيار الخاصة بيها', 'd.genericParts': '+ {n} قطعة عامة (رولمان، محركات، كهرباء)', 'd.compatible': 'المعدات اللي بتستخدمها', 'd.stockValue': 'قيمة الرصيد',
      'd.contents': 'محتوى المخزن', 'd.fgLater': 'أرصدة المنتج التام بدرجات اللون والمقاس بتظهر في الدفعة A4.', 'd.supplied': 'الأصناف اللي بيوردها', 'd.sparesSupplied': 'قطع غيار: {n} صنف',
      'd.account': 'الحساب', 'd.salesLater': 'الطلبيات والمديونية والتحصيل بتظهر في الدفعة A4.', 'd.tenure': 'مدة الخدمة', 'd.years': '{n} سنة', 'd.paymentMethod': 'طريقة الدفع',
      'd.priceList': 'قائمة الأسعار', 'd.since': 'عميل من', 'd.contact': 'البيانات', 'd.leadTime': 'مدة التوريد', 'd.slipDensity': 'كثافة الروبة جم/لتر', 'd.residue': 'متبقي منخل 63 ميكرون %',
      'd.powderMoisture': 'رطوبة البودرة %', 'd.slipWater': 'مية الروبة %', 'd.density': 'الكثافة جم/لتر', 'd.viscosity': 'اللزوجة (ثانية)', 'd.itemsCount': '{n} صنف', 'd.belowMinCount': '{n} تحت الحد',
      'k.product': 'منتج', 'k.material': 'خامة', 'k.recipe': 'تركيبة', 'k.asset': 'معدة', 'k.part': 'قطعة غيار', 'k.warehouse': 'مخزن', 'k.supplier': 'مورد', 'k.dealer': 'عميل', 'k.employee': 'موظف',
    },
    en: {
      'brand.sub': 'Factory management system', 'demo.note': 'Demo — every name and number here is fictional and belongs to no real factory.', 'demo.tag': 'Demo',
      'theme': 'Toggle theme', 'menu': 'Menu', 'signOut': 'Sign out', 'signIn': 'Sign in', 'login.title': 'Sign in', 'login.hint': 'Demo build — just press Sign in.',
      'login.email': 'Email', 'login.password': 'Password', 'back': 'Back', 'close': 'Close',
      'g.overview': 'Overview', 'g.production': 'Production', 'g.quality': 'Quality', 'g.commercial': 'Commercial & stores', 'g.support': 'Support', 'g.master': 'Master data',
      'phase': 'Phase {p}', 'ready': 'Ready', 'all': 'All', 'search': 'Search by name or code…', 'count': '{shown} of {total}', 'pageOf': 'Page {p} of {n}',
      'prev': 'Previous', 'next': 'Next', 'empty': 'Nothing matches. Try removing a filter.', 'egp': 'EGP', 'perM2': 'EGP/m²', 'yes': 'Yes', 'no': 'No',
      'planned.lead': 'This screen is built in phase {p}. Here is what it will hold, per the plan:', 'planned.screens': 'Planned screens', 'planned.kpis': 'Dashboard indicators',
      'planned.ready': 'Master data it will use (already built)', 'open': 'Open',
      'profile.title': 'Factory profile', 'profile.founded': 'Founded {y}', 'profile.capDay': 'm² daily capacity', 'profile.capYear': 'million m² a year', 'profile.lines': 'production lines',
      'profile.employees': 'staff', 'profile.products': 'products', 'profile.dealers': 'dealers & customers', 'profile.suppliers': 'suppliers', 'profile.assets': 'machines',
      'profile.linesTitle': 'Production lines and kilns', 'profile.capacity': 'Daily capacity', 'profile.kiln': 'Kiln', 'profile.kilnSpec': '{len} m · {cyc}-min cycle · up to {temp} °C',
      'profile.sizes': 'Sizes', 'profile.packing': 'Packing by size', 'profile.packNote': 'Sold by the square metre, stored by the box, loaded by the pallet — this table converts between them.',
      'profile.shifts': 'Shifts', 'profile.sites': 'Sites and stores', 'profile.roadmap': 'Demo build path', 'profile.now': 'Now',
      'profile.families': 'Product range',
      'rm.A1': 'Master data, structure and navigation', 'rm.A2': 'Executive, production and quality dashboards', 'rm.A3': 'Planning, body prep, glaze, lines, sorting and lab',
      'rm.A4': 'Stores with shade-level finished goods, sales and dispatch', 'rm.A5': 'Purchasing, maintenance, energy, people, costing, safety', 'rm.A6': 'Excel import, tablet screens, demo script',
      'c.code': 'Code', 'c.name': 'Name', 'c.family': 'Family', 'c.size': 'Size', 'c.finish': 'Finish', 'c.line': 'Line', 'c.g1': 'First choice', 'c.g2': 'Commercial', 'c.cost': 'Standard cost',
      'c.status': 'Status', 'c.category': 'Category', 'c.unit': 'Unit', 'c.origin': 'Origin', 'c.supplier': 'Supplier', 'c.stdCost': 'Unit cost', 'c.minStock': 'Reorder point', 'c.lead': 'Lead time',
      'c.type': 'Type', 'c.version': 'Version', 'c.effective': 'Effective from', 'c.items': 'Components', 'c.usedBy': 'Products', 'c.area': 'Location', 'c.maker': 'Maker & model', 'c.year': 'Installed',
      'c.crit': 'Criticality', 'c.pm': 'Preventive maintenance', 'c.for': 'For', 'c.stock': 'On hand / min', 'c.bin': 'Bin', 'c.site': 'Site', 'c.keeper': 'Storekeeper', 'c.locations': 'Locations',
      'c.capacity': 'Capacity', 'c.areaM2': 'Area m²', 'c.country': 'Country', 'c.terms': 'Payment terms', 'c.rating': 'Rating', 'c.gov': 'Governorate', 'c.region': 'Region', 'c.rep': 'Sales rep',
      'c.credit': 'Credit limit', 'c.class': 'Class', 'c.dept': 'Department', 'c.title': 'Job title', 'c.shift': 'Shift', 'c.hired': 'Hired', 'c.stage': 'Stage', 'c.standard': 'Standard',
      'c.source': 'Defect source', 'c.level': 'Level', 'pm.unit.hours': 'hours', 'pm.unit.strokes': 'strokes', 'pm.overdue': 'Overdue', 'pm.atMeter': 'at {n} {u}', 'c.planned': 'Planned?', 'c.days': '{n} days', 'c.target': 'Annual target',
      's.active': 'Active', 's.new': 'New', 's.discontinued': 'Discontinued', 's.running': 'Running', 's.maintenance': 'In maintenance', 's.standby': 'Standby', 's.onLeave': 'On leave', 's.suspended': 'Suspended',
      's.creditHold': 'Credit hold', 's.inactive': 'Inactive', 's.belowMin': 'Below minimum', 's.ok': 'Sufficient', 's.critical': 'Critical',
      'pm.hours': 'Every {n} running hours', 'pm.strokes': 'Every {n} strokes', 'pm.calendar': 'Every {n} days',
      'lvl.manager': 'Manager', 'lvl.professional': 'Professional', 'lvl.supervisor': 'Supervisor', 'lvl.technician': 'Technician', 'lvl.worker': 'Worker',
      'origin.local': 'Local', 'origin.imported': 'Imported', 'cash': 'Cash', 'body': 'Body', 'glaze': 'Glaze', 'anyEquipment': 'Any equipment (general)',
      'p.products': 'Products', 'p.products.sub': 'Every design by size and finish, with prices per grade and standard cost.',
      'p.materials': 'Materials', 'p.materials.sub': 'Body raw materials, frits and glazes, inks, packaging, chemicals and consumables.',
      'p.recipes': 'Recipes', 'p.recipes.sub': 'Body and glaze recipes with percentages, versions and lab targets.',
      'p.assets': 'Equipment', 'p.assets.sub': 'Every machine in the plant and its preventive maintenance plan.',
      'p.spareParts': 'Spare parts', 'p.spareParts.sub': 'Spare parts with stock, reorder points and bin locations.',
      'p.warehouses': 'Warehouses', 'p.warehouses.sub': 'The seven stores at the factory and in Cairo.',
      'p.suppliers': 'Suppliers', 'p.suppliers.sub': 'Suppliers of minerals, frits, inks, packaging and spare parts.',
      'p.dealers': 'Dealers & customers', 'p.dealers.sub': 'Dealers, distributors, contractors, projects and export, with credit limits and reps.',
      'p.employees': 'Employees', 'p.employees.sub': 'Staff by department, job and shift.',
      'p.codes': 'Codes & standards', 'p.codes.sub': 'Defect codes, downtime reasons and quality tests with their specifications.',
      'tab.defects': 'Defect codes', 'tab.downtime': 'Downtime reasons', 'tab.tests': 'Quality tests',
      'd.packing': 'Packing', 'd.pcsBox': 'Tiles per box', 'd.m2Box': 'm² per box', 'd.kgBox': 'Box weight', 'd.boxesPallet': 'Boxes per pallet', 'd.m2Pallet': 'm² per pallet',
      'd.thickness': 'Thickness', 'd.prices': 'Prices by grade and price list', 'd.perBox': 'per box', 'd.margin': 'First-choice margin', 'd.production': 'Production',
      'd.bodyRecipe': 'Body recipe', 'd.glazeRecipe': 'Glaze recipe', 'd.faces': 'Design faces', 'd.ink': 'Ink', 'd.glazeWeight': 'Glaze', 'd.absorption': 'Absorption group (ISO 13006)',
      'd.pei': 'Abrasion class', 'd.slip': 'Slip resistance', 'd.launched': 'In production since', 'd.usedIn': 'Used in recipes', 'd.composition': 'Composition', 'd.targets': 'Lab targets',
      'd.additives': 'Additives', 'd.productsUsing': 'Products using it', 'd.pmPlan': 'Preventive maintenance plan', 'd.meter': 'Current meter', 'd.lastPm': 'Last service', 'd.nextPm': 'Next service',
      'd.parts': 'Its spare parts', 'd.genericParts': '+ {n} general parts (bearings, motors, electrical)', 'd.compatible': 'Machines that use it', 'd.stockValue': 'Stock value',
      'd.contents': 'What is stored here', 'd.fgLater': 'Finished-goods stock by shade and caliber appears in phase A4.', 'd.supplied': 'Items supplied', 'd.sparesSupplied': 'Spare parts: {n} items',
      'd.account': 'Account', 'd.salesLater': 'Orders, balance and collections appear in phase A4.', 'd.tenure': 'Service', 'd.years': '{n} years', 'd.paymentMethod': 'Payment method',
      'd.priceList': 'Price list', 'd.since': 'Customer since', 'd.contact': 'Details', 'd.leadTime': 'Lead time', 'd.slipDensity': 'Slip density g/L', 'd.residue': 'Residue on 63 µm %',
      'd.powderMoisture': 'Powder moisture %', 'd.slipWater': 'Slip water %', 'd.density': 'Density g/L', 'd.viscosity': 'Viscosity (s)', 'd.itemsCount': '{n} items', 'd.belowMinCount': '{n} below minimum',
      'k.product': 'Product', 'k.material': 'Material', 'k.recipe': 'Recipe', 'k.asset': 'Machine', 'k.part': 'Spare part', 'k.warehouse': 'Warehouse', 'k.supplier': 'Supplier', 'k.dealer': 'Customer', 'k.employee': 'Employee',
    },
  };

  var state = {
    locale: 'ar',
    page: 'profile',
    signedIn: true,
    navOpen: false,
    lists: {},
    drawer: [],
    codesTab: 'defects',
  };
  try {
    var savedLocale = localStorage.getItem('nova-locale');
    if (savedLocale === 'ar' || savedLocale === 'en') state.locale = savedLocale;
    var savedTheme = localStorage.getItem('nova-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.setAttribute('data-theme', savedTheme);
  } catch (e) { /* storage unavailable: defaults apply */ }

  function t(key, vars) {
    var s = UI[state.locale][key];
    if (s == null) s = UI.ar[key];
    if (s == null) s = key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }
  function L(x) { if (x == null) return ''; if (typeof x === 'string' || typeof x === 'number') return String(x); return x[state.locale] || x.ar || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Latin digits in Arabic too: product codes, sizes and line names already use them, and mixing both scripts on one screen reads as a bug.
  function numLocale() { return state.locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'; }
  function nf(digits) { return new Intl.NumberFormat(numLocale(), { maximumFractionDigits: digits == null ? 0 : digits }); }
  function num(n, digits) { return n == null ? '—' : nf(digits).format(n); }
  function year(n) { return new Intl.NumberFormat(numLocale(), { useGrouping: false }).format(n); }
  function pct() { return state.locale === 'ar' ? '٪' : '%'; }
  function m2() { return state.locale === 'ar' ? 'م²' : 'm²'; }
  function money(n) { return num(n) + ' ' + t('egp'); }
  function date(iso) { return new Date(iso + 'T00:00:00Z').toLocaleDateString(state.locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function normalize(s) {
    return String(s).toLowerCase()
      .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); });
  }
  function cmp(a, b) { if (a == null) return 1; if (b == null) return -1; return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), state.locale); }

  // ================================================================ lookups
  var by = {};
  ['products', 'materials', 'suppliers', 'assets', 'spareParts', 'warehouses', 'dealers', 'employees', 'departments'].forEach(function (k) {
    by[k] = {}; DB[k].forEach(function (x) { by[k][x.id] = x; });
  });
  by.recipes = {};
  DB.recipes.body.forEach(function (r) { r.kind = 'body'; by.recipes[r.id] = r; });
  DB.recipes.glaze.forEach(function (r) { r.kind = 'glaze'; by.recipes[r.id] = r; });
  var allRecipes = DB.recipes.body.concat(DB.recipes.glaze);
  var LINE = {}; DB.lines.forEach(function (l) { LINE[l.id] = l; });
  var DESIGN = {}; DB.designs.forEach(function (d) { DESIGN[d.id] = d; });
  var currentUser = DB.employees.filter(function (e) { return e.departmentId === 'D01'; })[2];

  // ================================================================ icons
  var ICON = {
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2 6 6M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-3.6-3.6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    home: '<path d="M4 20V10l8-6 8 6v10h-5v-6H9v6z"/>',
    chart: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    mill: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 5v2.5M12 16.5V19M5 12h2.5M16.5 12H19"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
    factory: '<path d="M3 20V10l5 3V10l5 3V6h3l1 4h4v10z"/><path d="M7 17h2M12 17h2M17 17h1"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 9A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 15h9"/>',
    box: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
    cart: '<circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/><path d="M3 4h2l2.4 11h10.8l2-7.5H6.2"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L3 17.5 6.5 21l6.3-6.3a4 4 0 0 0 4.9-5.4l-2.8 2.8-2.5-2.5 2.3-2.3Z"/>',
    bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M18 14.3c1.8.8 3 2.6 3 4.7"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3"/>',
    shield: '<path d="M12 3 4.5 5.5V11c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V5.5L12 3Z"/>',
    tile: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 5.6l2.1 2.1M17.7 16.3l2.1 2.1M2.5 12h3M18.5 12h3M4.2 18.4l2.1-2.1M17.7 7.7l2.1-2.1"/>',
    nut: '<path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9Z"/><circle cx="12" cy="12" r="3"/>',
    warehouse: '<path d="M3 20V9l9-5 9 5v11"/><path d="M7 20v-7h10v7M7 16h10"/>',
    building: '<path d="M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M16 21v-9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9M4 21h16M8 7h1M8 11h1M8 15h1M11 7h1M11 11h1M11 15h1"/>',
    store: '<path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9h16"/><path d="M9 20v-6h6v6"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.6-1.6 1.8-2.5 3.2-2.5s2.6.9 3.2 2.5M14 10h4M14 13h3"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  };
  function icon(name, size) {
    size = size || 16;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (name === 'back' || name === 'logout' ? ' class="flip"' : '') + '>' + ICON[name] + '</svg>';
  }

  // ================================================================ modules (the 16 departments)
  function b(ar, en) { return { ar: ar, en: en }; }
  var GROUPS = ['overview', 'production', 'quality', 'commercial', 'support', 'master'];
  var MODULES = [
    { id: 'exec', group: 'overview', phase: 'A2', icon: 'chart', name: b('الإدارة العليا', 'Executive'),
      screens: [b('لوحة الصباح: إنتاج وفرز ومبيعات وتحصيل', 'Morning board: output, grades, sales, collections'), b('مقارنة الشهر بالخطة', 'Month against plan'), b('التنبيهات اللي محتاجة قرار', 'Alerts that need a decision'), b('موافقات الخصم وتجاوز الائتمان', 'Discount and credit-limit approvals')],
      kpis: [b('إنتاج م² اليوم والشهر', 'm² today and month to date'), b('نسبة الفرز الأول', 'First-choice rate'), b('المبيعات والتحصيل', 'Sales and collections'), b('غاز م³ لكل م²', 'Gas m³ per m²'), b('أيام تغطية المخزون', 'Days of stock cover')],
      uses: ['products', 'dealers', 'assets'] },
    { id: 'planning', group: 'production', phase: 'A3', icon: 'calendar', name: b('التخطيط وجدولة الإنتاج', 'Planning & scheduling'),
      screens: [b('خطة شهرية وأسبوعية لكل خط', 'Monthly and weekly plan per line'), b('جدول تغيير المقاسات والتصميمات', 'Size and design changeover schedule'), b('احتياجات الخامات والجليز من الخطة', 'Material and glaze needs from the plan'), b('الخطة مقابل الطلبيات المفتوحة', 'Plan against open orders')],
      kpis: [b('الالتزام بالخطة', 'Plan adherence'), b('عدد مرات التغيير ووقته', 'Changeovers and their time'), b('طلبيات متأخرة', 'Late orders')], uses: ['products', 'recipes'] },
    { id: 'prep', group: 'production', phase: 'A3', icon: 'mill', name: b('تحضير الخامات', 'Body preparation'),
      screens: [b('تشغيلات الطواحين: الشحنة والمية والمُسيّل والساعات', 'Mill runs: charge, water, deflocculant, hours'), b('تانكات الروبة وقياساتها', 'Slip tanks and readings'), b('تقرير الأتومايزر', 'Atomizer report'), b('أرصدة الصوامع', 'Silo levels')],
      kpis: [b('الكثافة والمتبقي', 'Density and residue'), b('رطوبة البودرة', 'Powder moisture'), b('طن بودرة في اليوم', 'Tonnes of powder a day'), b('الاستهلاك مقابل التركيبة', 'Consumption against recipe')], uses: ['recipes', 'materials', 'assets'] },
    { id: 'glaze', group: 'production', phase: 'A3', icon: 'drop', name: b('الجليز والتصميمات', 'Glaze & designs'),
      screens: [b('تشغيلات الجليز والإنجوب', 'Glaze and engobe batches'), b('مكتبة التصميمات بإصداراتها ووجوهها', 'Design library with versions and faces'), b('أرصدة الأحبار لكل لون', 'Ink stock by colour'), b('أوزان الطبقات لكل منتج', 'Layer weights per product')],
      kpis: [b('جم حبر لكل م²', 'Ink g/m²'), b('كجم جليز لكل م²', 'Glaze kg/m²'), b('مبيعات كل تصميم', 'Sales by design')], uses: ['recipes', 'products', 'materials'] },
    { id: 'lines', group: 'production', phase: 'A2', icon: 'factory', name: b('خطوط الإنتاج', 'Production lines'),
      screens: [b('تقرير الوردية لكل خط', 'Shift report per line'), b('قراءات المكبس والفرن', 'Press and kiln readings'), b('التوقفات بأسبابها', 'Downtime with reasons'), b('الكسر في كل مرحلة', 'Breakage at each stage'), b('شاشة تابلت للعامل', 'Operator tablet screen')],
      kpis: [b('كفاءة المعدات الكلية', 'Overall equipment effectiveness'), b('ساعات التوقف', 'Downtime hours'), b('م² في الساعة', 'm² per hour'), b('كسر أخضر ومحروق', 'Green and fired breakage')], uses: ['assets', 'codes', 'products', 'employees'] },
    { id: 'sorting', group: 'production', phase: 'A3', icon: 'layers', name: b('الفرز والتعبئة', 'Sorting & packing'),
      screens: [b('ناتج الفرز بالفرز ودرجة اللون والمقاس', 'Sorting output by grade, shade and caliber'), b('إنشاء لوط وملصق باليتة بباركود', 'Lot creation and barcoded pallet label'), b('التحويل للمخزن التام', 'Transfer to finished goods'), b('إعادة الفرز', 'Re-sorting')],
      kpis: [b('توزيع الفروز', 'Grade mix'), b('درجات اللون في اللوط', 'Shades per lot'), b('باليتات في الوردية', 'Pallets per shift')], uses: ['products', 'codes'] },
    { id: 'quality', group: 'quality', phase: 'A2', icon: 'flask', name: b('الجودة والمعمل', 'Quality & lab'),
      screens: [b('فحص الخامات الواردة', 'Incoming inspection'), b('فحوص أثناء التشغيل', 'In-process checks'), b('اختبارات المنتج التام', 'Finished-product tests'), b('حجز لوط وتقرير عدم مطابقة', 'Lot hold and non-conformance report'), b('شهادة مطابقة للتصدير', 'Export certificate of conformity')],
      kpis: [b('نسبة نجاح الاختبارات', 'Test pass rate'), b('أكثر العيوب تكرارًا', 'Most frequent defects'), b('تقارير مفتوحة', 'Open reports'), b('شكاوى التجار', 'Dealer complaints')], uses: ['codes', 'products', 'materials'] },
    { id: 'stores', group: 'commercial', phase: 'A4', icon: 'box', name: b('المخازن والمنتج التام', 'Stores & finished goods'),
      screens: [b('المنتج التام بالفرز ودرجة اللون والمقاس والموقع', 'Finished goods by grade, shade, caliber and location'), b('أرصدة الخامات والكيماويات', 'Material and chemical stock'), b('التحويلات والجرد', 'Transfers and counts'), b('الحجز للطلبيات', 'Reservations for orders'), b('عمر المخزون', 'Stock ageing')],
      kpis: [b('م² متاح بالفرز', 'Available m² by grade'), b('أيام تغطية الخامات', 'Material days of cover'), b('الرصيد المتفتت', 'Fragmented shade stock')], uses: ['warehouses', 'products', 'materials', 'spareParts'] },
    { id: 'sales', group: 'commercial', phase: 'A4', icon: 'cart', name: b('المبيعات والتجار', 'Sales & dealers'),
      screens: [b('عروض الأسعار', 'Quotations'), b('طلبية بشرط نفس درجة اللون', 'Orders requiring a single shade'), b('الحجز وحد الائتمان', 'Reservation and credit limit'), b('المرتجعات والشكاوى باللوط', 'Returns and complaints by lot'), b('عمولات المناديب', 'Rep commissions')],
      kpis: [b('المبيعات بالمنطقة والتاجر', 'Sales by region and dealer'), b('طلبيات تحت التنفيذ', 'Orders in progress'), b('متوسط سعر المتر', 'Average price per m²')], uses: ['dealers', 'products', 'employees'] },
    { id: 'dispatch', group: 'commercial', phase: 'A4', icon: 'truck', name: b('التوزيع والشحن', 'Dispatch & shipping'),
      screens: [b('أوامر التحميل', 'Loading orders'), b('العربيات والسواقين', 'Trucks and drivers'), b('مسح باركود الباليتات', 'Pallet barcode scanning'), b('إذن الخروج من البوابة', 'Gate pass')],
      kpis: [b('عربيات في اليوم', 'Trucks a day'), b('زمن التحميل', 'Loading time'), b('التسليم في الميعاد', 'On-time delivery')], uses: ['dealers', 'warehouses'] },
    { id: 'purchasing', group: 'commercial', phase: 'A5', icon: 'receipt', name: b('المشتريات والاستيراد', 'Purchasing & imports'),
      screens: [b('طلبات الشراء', 'Purchase requests'), b('مقارنة عروض الموردين', 'Supplier quote comparison'), b('أوامر الشراء', 'Purchase orders'), b('استلام موقوف على نتيجة المعمل', 'Receipt held for lab release'), b('متابعة الشحنات المستوردة', 'Import shipment tracking')],
      kpis: [b('مدة التوريد', 'Lead time'), b('توريد مرفوض من المعمل', 'Lab-rejected deliveries'), b('خامات تحت حد الطلب', 'Materials below reorder point')], uses: ['suppliers', 'materials', 'spareParts'] },
    { id: 'maintenance', group: 'support', phase: 'A5', icon: 'wrench', name: b('الصيانة', 'Maintenance'),
      screens: [b('الصيانة الوقائية بالساعات أو الكبسات', 'Preventive plans by hours or strokes'), b('أوامر شغل الأعطال', 'Breakdown work orders'), b('صرف قطع الغيار', 'Spare-part issues'), b('تاريخ كل معدة', 'Machine history')],
      kpis: [b('متوسط الوقت بين الأعطال', 'Mean time between failures'), b('متوسط وقت الإصلاح', 'Mean time to repair'), b('الالتزام بالوقائي', 'Preventive compliance')], uses: ['assets', 'spareParts'] },
    { id: 'energy', group: 'support', phase: 'A5', icon: 'bolt', name: b('الطاقة والمرافق', 'Energy & utilities'),
      screens: [b('قراءات عدادات الغاز لكل فرن وأتومايزر', 'Gas meter readings per kiln and atomizer'), b('الكهرباء والمية', 'Electricity and water'), b('الاستهلاك لكل م²', 'Consumption per m²'), b('تنبيه الانحراف', 'Deviation alerts')],
      kpis: [b('غاز م³ لكل م²', 'Gas m³ per m²'), b('كهرباء ك.و.س لكل م²', 'kWh per m²'), b('تكلفة الطاقة لكل م²', 'Energy cost per m²')], uses: ['assets'] },
    { id: 'people', group: 'support', phase: 'A5', icon: 'users', name: b('الحضور والورديات', 'Attendance & shifts'),
      screens: [b('جداول الورديات', 'Shift rosters'), b('الحضور والانصراف', 'Time and attendance'), b('الإجازات والإضافي', 'Leave and overtime'), b('تصدير الساعات لنظام المرتبات', 'Hours export to payroll')],
      kpis: [b('نسبة الحضور', 'Attendance rate'), b('ساعات الإضافي', 'Overtime hours'), b('م² لكل عامل', 'm² per worker')], uses: ['employees'] },
    { id: 'costing', group: 'support', phase: 'A5', icon: 'coins', name: b('التكاليف والتحصيل', 'Costing & collections'),
      screens: [b('تكلفة المتر المعيارية لكل منتج', 'Standard cost per m² by product'), b('الفعلي مقابل المعياري', 'Actual against standard'), b('أعمار ديون التجار', 'Dealer receivables ageing'), b('تصدير القيود لبرنامج الحسابات', 'Journal export to accounting')],
      kpis: [b('تكلفة م² فعلية', 'Actual cost per m²'), b('هامش كل منتج', 'Margin by product'), b('ديون فوق 90 يوم', 'Receivables over 90 days')], uses: ['products', 'dealers'] },
    { id: 'safety', group: 'support', phase: 'A5', icon: 'shield', name: b('السلامة والبيئة', 'Health, safety & environment'),
      screens: [b('الحوادث والإصابات', 'Incidents and injuries'), b('تصاريح الشغل الخطر', 'Permits to work'), b('فحص معدات الوقاية', 'Protective equipment checks'), b('قياسات الغبار والانبعاثات', 'Dust and emission readings')],
      kpis: [b('أيام بلا إصابات', 'Days without injury'), b('ملاحظات مفتوحة', 'Open observations')], uses: ['employees', 'materials'] },
  ];
  var MASTER = [
    { id: 'products', icon: 'tile' }, { id: 'materials', icon: 'drop' }, { id: 'recipes', icon: 'list' }, { id: 'assets', icon: 'gear' },
    { id: 'spareParts', icon: 'nut' }, { id: 'warehouses', icon: 'warehouse' }, { id: 'suppliers', icon: 'building' }, { id: 'dealers', icon: 'store' },
    { id: 'employees', icon: 'id' }, { id: 'codes', icon: 'tag' },
  ];
  var MODULE_BY_ID = {}; MODULES.forEach(function (m) { MODULE_BY_ID[m.id] = m; });
  function pageExists(id) { return id === 'profile' || !!MODULE_BY_ID[id] || MASTER.some(function (m) { return m.id === id; }); }
  function pageTitle(id) {
    if (id === 'profile') return t('profile.title');
    if (MODULE_BY_ID[id]) return L(MODULE_BY_ID[id].name);
    return t('p.' + id);
  }

  // ================================================================ small render helpers
  function chip(text, tone, plain) { return '<span class="chip' + (tone ? ' ' + tone : '') + (plain ? ' plain' : '') + '">' + esc(text) + '</span>'; }
  function statusChip(status) {
    var tone = { active: 'pos', running: 'pos', new: 'accent', discontinued: '', maintenance: 'warn', standby: '', onLeave: 'warn', suspended: 'bad', creditHold: 'bad', inactive: '' }[status];
    return chip(t('s.' + status), tone);
  }
  function openLink(kind, id, label) { return '<button class="link" data-action="open" data-kind="' + kind + '" data-id="' + esc(id) + '">' + esc(label) + '</button>'; }
  function facts(pairs) {
    return '<dl class="facts">' + pairs.filter(function (p) { return p; }).map(function (p) { return '<div><dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd></div>'; }).join('') + '</dl>';
  }
  function block(title, inner) { return '<section class="block"><h3>' + esc(title) + '</h3>' + inner + '</section>'; }
  function unit(u) { return L(DB.units[u] || u); }
  function days(n) { return t('c.days', { n: num(n) }); }
  function specText(spec) {
    if (!spec) return '—';
    var lo = spec[0], hi = spec[1];
    if (lo != null && hi != null) return num(lo, 2) + ' – ' + num(hi, 2);
    if (lo != null) return '≥ ' + num(lo, 2);
    return '≤ ' + num(hi, 2);
  }
  var SWATCH = ['#a8672f', '#2f5bff', '#137a4b', '#b8860b', '#7a4fd0', '#c2410c', '#0e7490', '#9d174d'];

  // ================================================================ list pages
  function supplierName(id) { return id && by.suppliers[id] ? L(by.suppliers[id].name) : t('origin.local'); }
  function productsUsingRecipe(id) { return DB.products.filter(function (p) { return p.bodyRecipe === id || p.glazeRecipe === id; }); }
  function price(p, grade) { return p.prices.filter(function (x) { return x.grade === grade; })[0].perM2; }

  var LISTS = {
    products: {
      kind: 'product', rows: function () { return DB.products; },
      search: function (p) { return p.code + ' ' + p.name.ar + ' ' + p.name.en; },
      filters: [
        { key: 'family', label: 'c.family', options: function () { return Object.keys(DB.families).map(function (k) { return [k, L(DB.families[k].name)]; }); }, test: function (p, v) { return p.family === v; } },
        { key: 'size', label: 'c.size', options: function () { return Object.keys(DB.sizes).map(function (k) { return [k, L(DB.sizes[k].label)]; }); }, test: function (p, v) { return p.sizeId === v; } },
        { key: 'finish', label: 'c.finish', options: function () { return Object.keys(DB.finishes).map(function (k) { return [k, L(DB.finishes[k].name)]; }); }, test: function (p, v) { return p.finish === v; } },
        { key: 'status', label: 'c.status', options: function () { return ['active', 'new', 'discontinued'].map(function (k) { return [k, t('s.' + k)]; }); }, test: function (p, v) { return p.status === v; } },
      ],
      columns: [
        { key: 'code', label: 'c.code', sort: function (p) { return p.code; }, cell: function (p) { return '<span class="mono">' + esc(p.code) + '</span>'; } },
        { key: 'name', label: 'c.name', sort: function (p) { return L(DESIGN[p.designId].name); }, cell: function (p) { return '<div class="cell-main">' + esc(L(DESIGN[p.designId].name)) + '<small>' + esc(L(DB.finishes[p.finish].name)) + '</small></div>'; } },
        { key: 'size', label: 'c.size', sort: function (p) { return DB.sizes[p.sizeId].w * DB.sizes[p.sizeId].h; }, cell: function (p) { return '<span class="num">' + esc(L(DB.sizes[p.sizeId].label)) + '</span>'; } },
        { key: 'family', label: 'c.family', sort: function (p) { return p.family; }, cell: function (p) { return esc(L(DB.families[p.family].name)); } },
        { key: 'line', label: 'c.line', sort: function (p) { return p.line; }, cell: function (p) { return esc(p.line); } },
        { key: 'g1', label: 'c.g1', end: true, sort: function (p) { return price(p, 'G1'); }, cell: function (p) { return '<span class="num">' + num(price(p, 'G1')) + '</span>'; } },
        { key: 'g2', label: 'c.g2', end: true, sort: function (p) { return price(p, 'G2'); }, cell: function (p) { return '<span class="num">' + num(price(p, 'G2')) + '</span>'; } },
        { key: 'cost', label: 'c.cost', end: true, sort: function (p) { return p.stdCostPerM2; }, cell: function (p) { return '<span class="num">' + num(p.stdCostPerM2) + '</span>'; } },
        { key: 'status', label: 'c.status', sort: function (p) { return p.status; }, cell: function (p) { return statusChip(p.status); } },
      ],
      note: function () { return t('perM2'); },
    },
    materials: {
      kind: 'material', rows: function () { return DB.materials; },
      search: function (m) { return m.code + ' ' + m.name.ar + ' ' + m.name.en; },
      filters: [
        { key: 'category', label: 'c.category', options: function () { return Object.keys(DB.materialCategories).map(function (k) { return [k, L(DB.materialCategories[k])]; }); }, test: function (m, v) { return m.category === v; } },
        { key: 'origin', label: 'c.origin', options: function () { return [['local', t('origin.local')], ['imported', t('origin.imported')]]; }, test: function (m, v) { return (v === 'imported') === m.imported; } },
      ],
      columns: [
        { key: 'code', label: 'c.code', sort: function (m) { return m.code; }, cell: function (m) { return '<span class="mono">' + esc(m.code) + '</span>'; } },
        { key: 'name', label: 'c.name', sort: function (m) { return L(m.name); }, cell: function (m) { return esc(L(m.name)); } },
        { key: 'category', label: 'c.category', sort: function (m) { return m.category; }, cell: function (m) { return esc(L(DB.materialCategories[m.category])); } },
        { key: 'origin', label: 'c.origin', sort: function (m) { return m.origin; }, cell: function (m) { return m.imported ? chip(L(DB.origins[m.origin]), 'accent') : chip(L(DB.origins[m.origin]), '', true); } },
        { key: 'supplier', label: 'c.supplier', sort: function (m) { return supplierName(m.supplierId); }, cell: function (m) { return esc(supplierName(m.supplierId)); } },
        { key: 'cost', label: 'c.stdCost', end: true, sort: function (m) { return m.stdCost; }, cell: function (m) { return '<span class="num">' + num(m.stdCost) + ' / ' + esc(unit(m.unit)) + '</span>'; } },
        { key: 'min', label: 'c.minStock', end: true, sort: function (m) { return m.minStock; }, cell: function (m) { return '<span class="num">' + num(m.minStock) + ' ' + esc(unit(m.unit)) + '</span>'; } },
        { key: 'lead', label: 'c.lead', end: true, sort: function (m) { return m.leadTimeDays; }, cell: function (m) { return '<span class="num">' + days(m.leadTimeDays) + '</span>'; } },
      ],
    },
    recipes: {
      kind: 'recipe', rows: function () { return allRecipes; },
      search: function (r) { return r.id + ' ' + r.name.ar + ' ' + r.name.en; },
      filters: [{ key: 'kind', label: 'c.type', options: function () { return [['body', t('body')], ['glaze', t('glaze')]]; }, test: function (r, v) { return r.kind === v; } }],
      columns: [
        { key: 'id', label: 'c.code', sort: function (r) { return r.id; }, cell: function (r) { return '<span class="mono">' + esc(r.id) + '</span>'; } },
        { key: 'name', label: 'c.name', sort: function (r) { return L(r.name); }, cell: function (r) { return esc(L(r.name)); } },
        { key: 'kind', label: 'c.type', sort: function (r) { return r.kind; }, cell: function (r) { return chip(t(r.kind), r.kind === 'body' ? 'glaze' : 'accent', true); } },
        { key: 'version', label: 'c.version', end: true, sort: function (r) { return r.version; }, cell: function (r) { return '<span class="num">v' + r.version + '</span>'; } },
        { key: 'items', label: 'c.items', end: true, sort: function (r) { return r.lines.length; }, cell: function (r) { return '<span class="num">' + num(r.lines.length) + '</span>'; } },
        { key: 'used', label: 'c.usedBy', end: true, sort: function (r) { return productsUsingRecipe(r.id).length; }, cell: function (r) { return '<span class="num">' + num(productsUsingRecipe(r.id).length) + '</span>'; } },
      ],
    },
    assets: {
      kind: 'asset', rows: function () { return DB.assets; },
      search: function (a) { return a.code + ' ' + a.type + ' ' + L(DB.assetTypes[a.type]) + ' ' + a.maker + ' ' + a.model; },
      filters: [
        { key: 'area', label: 'c.area', options: function () { return Object.keys(DB.areas).map(function (k) { return [k, L(DB.areas[k])]; }); }, test: function (a, v) { return a.area === v; } },
        { key: 'crit', label: 'c.crit', options: function () { return [['A', 'A'], ['B', 'B'], ['C', 'C']]; }, test: function (a, v) { return a.criticality === v; } },
        { key: 'status', label: 'c.status', options: function () { return ['running', 'maintenance', 'standby'].map(function (k) { return [k, t('s.' + k)]; }); }, test: function (a, v) { return a.status === v; } },
      ],
      columns: [
        { key: 'code', label: 'c.code', sort: function (a) { return a.code; }, cell: function (a) { return '<span class="mono">' + esc(a.code) + '</span>'; } },
        { key: 'name', label: 'c.name', sort: function (a) { return L(DB.assetTypes[a.type]); }, cell: function (a) { return esc(L(DB.assetTypes[a.type])); } },
        { key: 'area', label: 'c.area', sort: function (a) { return a.area; }, cell: function (a) { return esc(L(DB.areas[a.area])); } },
        { key: 'maker', label: 'c.maker', sort: function (a) { return a.maker; }, cell: function (a) { return '<div class="cell-main"><span>' + esc(a.maker) + '</span><small dir="ltr">' + esc(a.model) + '</small></div>'; } },
        { key: 'year', label: 'c.year', end: true, sort: function (a) { return a.year; }, cell: function (a) { return '<span class="num">' + year(a.year) + '</span>'; } },
        { key: 'crit', label: 'c.crit', sort: function (a) { return a.criticality; }, cell: function (a) { return chip(a.criticality, a.criticality === 'A' ? 'bad' : a.criticality === 'B' ? 'warn' : '', true); } },
        { key: 'pm', label: 'c.pm', sort: function (a) { return a.pmBasis; }, cell: function (a) { return '<span class="small">' + esc(t('pm.' + a.pmBasis, { n: num(a.pmInterval) })) + '</span>'; } },
        { key: 'status', label: 'c.status', sort: function (a) { return a.status; }, cell: function (a) { return statusChip(a.status); } },
      ],
    },
    spareParts: {
      kind: 'part', rows: function () { return DB.spareParts; },
      search: function (p) { return p.id + ' ' + p.name.ar + ' ' + p.name.en + ' ' + p.bin; },
      filters: [
        { key: 'for', label: 'c.for', options: function () {
          var types = {}; DB.spareParts.forEach(function (p) { types[p.assetType] = true; });
          return Object.keys(types).map(function (k) { return [k, k === '*' ? t('anyEquipment') : L(DB.assetTypes[k])]; });
        }, test: function (p, v) { return p.assetType === v; } },
        { key: 'stock', label: 'c.stock', options: function () { return [['low', t('s.belowMin')], ['ok', t('s.ok')]]; }, test: function (p, v) { return (p.onHand < p.minStock) === (v === 'low'); } },
        { key: 'critical', label: 'c.crit', options: function () { return [['yes', t('s.critical')]]; }, test: function (p) { return p.critical; } },
      ],
      columns: [
        { key: 'id', label: 'c.code', sort: function (p) { return p.id; }, cell: function (p) { return '<span class="mono">' + esc(p.id) + '</span>'; } },
        { key: 'name', label: 'c.name', sort: function (p) { return L(p.name); }, cell: function (p) { return esc(L(p.name)); } },
        { key: 'for', label: 'c.for', sort: function (p) { return p.assetType; }, cell: function (p) { return '<span class="small">' + esc(p.assetType === '*' ? t('anyEquipment') : L(DB.assetTypes[p.assetType])) + '</span>'; } },
        { key: 'stock', label: 'c.stock', end: true, sort: function (p) { return p.onHand - p.minStock; }, cell: function (p) { return '<span class="num">' + num(p.onHand) + ' / ' + num(p.minStock) + '</span> ' + (p.onHand < p.minStock ? chip(t('s.belowMin'), 'bad') : ''); } },
        { key: 'cost', label: 'c.stdCost', end: true, sort: function (p) { return p.unitCost; }, cell: function (p) { return '<span class="num">' + num(p.unitCost) + '</span>'; } },
        { key: 'critical', label: 'c.crit', sort: function (p) { return p.critical ? 0 : 1; }, cell: function (p) { return p.critical ? chip(t('s.critical'), 'warn', true) : ''; } },
        { key: 'bin', label: 'c.bin', sort: function (p) { return p.bin; }, cell: function (p) { return '<span class="mono">' + esc(p.bin) + '</span>'; } },
      ],
    },
    warehouses: {
      kind: 'warehouse', rows: function () { return DB.warehouses; },
      search: function (w) { return w.id + ' ' + w.name.ar + ' ' + w.name.en; }, filters: [],
      columns: [
        { key: 'id', label: 'c.code', sort: function (w) { return w.id; }, cell: function (w) { return '<span class="mono">' + esc(w.id) + '</span>'; } },
        { key: 'name', label: 'c.name', sort: function (w) { return L(w.name); }, cell: function (w) { return esc(L(w.name)); } },
        { key: 'site', label: 'c.site', sort: function (w) { return w.site; }, cell: function (w) { return esc(L(DB.sites.filter(function (s) { return s.id === w.site; })[0].name)); } },
        { key: 'keeper', label: 'c.keeper', sort: function (w) { return L(by.employees[w.keeperId].name); }, cell: function (w) { return esc(L(by.employees[w.keeperId].name)); } },
        { key: 'loc', label: 'c.locations', end: true, sort: function (w) { return w.locations; }, cell: function (w) { return '<span class="num">' + num(w.locations) + '</span>'; } },
        { key: 'cap', label: 'c.capacity', sort: function (w) { return w.areaM2; }, cell: function (w) { return esc(L(w.capacity)); } },
        { key: 'area', label: 'c.areaM2', end: true, sort: function (w) { return w.areaM2; }, cell: function (w) { return '<span class="num">' + num(w.areaM2) + '</span>'; } },
      ],
    },
    suppliers: {
      kind: 'supplier', rows: function () { return DB.suppliers; },
      search: function (s) { return s.id + ' ' + s.name.ar + ' ' + s.name.en + ' ' + L(s.city); },
      filters: [
        { key: 'category', label: 'c.category', options: function () { return Object.keys(DB.supplierCategories).map(function (k) { return [k, L(DB.supplierCategories[k])]; }); }, test: function (s, v) { return s.category === v; } },
        { key: 'origin', label: 'c.origin', options: function () { return [['local', t('origin.local')], ['imported', t('origin.imported')]]; }, test: function (s, v) { return (v === 'imported') === (s.country !== 'EG'); } },
      ],
      columns: [
        { key: 'id', label: 'c.code', sort: function (s) { return s.id; }, cell: function (s) { return '<span class="mono">' + esc(s.id) + '</span>'; } },
        { key: 'name', label: 'c.name', sort: function (s) { return L(s.name); }, cell: function (s) { return '<div class="cell-main">' + esc(L(s.name)) + '<small>' + esc(L(s.city)) + '</small></div>'; } },
        { key: 'category', label: 'c.category', sort: function (s) { return s.category; }, cell: function (s) { return esc(L(DB.supplierCategories[s.category])); } },
        { key: 'country', label: 'c.country', sort: function (s) { return s.country; }, cell: function (s) { return esc(L(DB.origins[s.country])); } },
        { key: 'terms', label: 'c.terms', sort: function (s) { return s.paymentTermsDays; }, cell: function (s) { return esc(s.paymentTermsDays ? days(s.paymentTermsDays) : L(s.paymentMethod)); } },
        { key: 'rating', label: 'c.rating', sort: function (s) { return s.rating; }, cell: function (s) { return chip(s.rating, s.rating === 'A' ? 'pos' : s.rating === 'B' ? '' : 'warn', true); } },
        { key: 'lead', label: 'c.lead', end: true, sort: function (s) { return s.leadTimeDays; }, cell: function (s) { return '<span class="num">' + days(s.leadTimeDays) + '</span>'; } },
      ],
    },
    dealers: {
      kind: 'dealer', rows: function () { return DB.dealers; },
      search: function (d) { return d.id + ' ' + d.name.ar + ' ' + d.name.en + ' ' + d.governorate.ar + ' ' + d.governorate.en; },
      filters: [
        { key: 'region', label: 'c.region', options: function () { return Object.keys(DB.regions).map(function (k) { return [k, L(DB.regions[k])]; }); }, test: function (d, v) { return d.region === v; } },
        { key: 'type', label: 'c.type', options: function () { return Object.keys(DB.dealerTypes).map(function (k) { return [k, L(DB.dealerTypes[k])]; }); }, test: function (d, v) { return d.type === v; } },
        { key: 'class', label: 'c.class', options: function () { return [['A', 'A'], ['B', 'B'], ['C', 'C']]; }, test: function (d, v) { return d.class === v; } },
        { key: 'status', label: 'c.status', options: function () { return ['active', 'creditHold', 'inactive'].map(function (k) { return [k, t('s.' + k)]; }); }, test: function (d, v) { return d.status === v; } },
      ],
      columns: [
        { key: 'id', label: 'c.code', sort: function (d) { return d.id; }, cell: function (d) { return '<span class="mono">' + esc(d.id) + '</span>'; } },
        { key: 'name', label: 'c.name', sort: function (d) { return L(d.name); }, cell: function (d) { return '<div class="cell-main">' + esc(L(d.name)) + '<small>' + esc(L(DB.dealerTypes[d.type])) + '</small></div>'; } },
        { key: 'gov', label: 'c.gov', sort: function (d) { return L(d.governorate); }, cell: function (d) { return esc(L(d.governorate)); } },
        { key: 'rep', label: 'c.rep', sort: function (d) { return d.repId ? L(by.employees[d.repId].name) : ''; }, cell: function (d) { return d.repId ? '<span class="small">' + esc(L(by.employees[d.repId].name)) + '</span>' : '—'; } },
        { key: 'credit', label: 'c.credit', end: true, sort: function (d) { return d.creditLimit; }, cell: function (d) { return '<span class="num">' + (d.creditLimit ? num(d.creditLimit) : '—') + '</span>'; } },
        { key: 'terms', label: 'c.terms', sort: function (d) { return d.paymentTermsDays; }, cell: function (d) { return esc(d.paymentTermsDays ? days(d.paymentTermsDays) : L(d.paymentMethod)); } },
        { key: 'class', label: 'c.class', sort: function (d) { return d.class; }, cell: function (d) { return chip(d.class, d.class === 'A' ? 'glaze' : '', true); } },
        { key: 'status', label: 'c.status', sort: function (d) { return d.status; }, cell: function (d) { return statusChip(d.status); } },
      ],
    },
    employees: {
      kind: 'employee', rows: function () { return DB.employees; },
      search: function (e) { return e.id + ' ' + e.name.ar + ' ' + e.name.en + ' ' + e.title.ar + ' ' + e.title.en; },
      filters: [
        { key: 'dept', label: 'c.dept', options: function () { return DB.departments.map(function (d) { return [d.id, L(d.name)]; }); }, test: function (e, v) { return e.departmentId === v; } },
        { key: 'shift', label: 'c.shift', options: function () { return DB.company.shifts.map(function (s) { return [s.id, L(s.name)]; }); }, test: function (e, v) { return e.shift === v; } },
        { key: 'level', label: 'c.level', options: function () { return ['manager', 'professional', 'supervisor', 'technician', 'worker'].map(function (k) { return [k, t('lvl.' + k)]; }); }, test: function (e, v) { return e.level === v; } },
        { key: 'status', label: 'c.status', options: function () { return ['active', 'onLeave', 'suspended'].map(function (k) { return [k, t('s.' + k)]; }); }, test: function (e, v) { return e.status === v; } },
      ],
      columns: [
        { key: 'id', label: 'c.code', sort: function (e) { return e.id; }, cell: function (e) { return '<span class="mono">' + esc(e.id) + '</span>'; } },
        { key: 'name', label: 'c.name', sort: function (e) { return L(e.name); }, cell: function (e) { return esc(L(e.name)); } },
        { key: 'dept', label: 'c.dept', sort: function (e) { return e.departmentId; }, cell: function (e) { return esc(L(by.departments[e.departmentId].name)); } },
        { key: 'title', label: 'c.title', sort: function (e) { return L(e.title); }, cell: function (e) { return '<span class="small">' + esc(L(e.title)) + '</span>'; } },
        { key: 'shift', label: 'c.shift', sort: function (e) { return e.shift; }, cell: function (e) { return esc(L(DB.company.shifts.filter(function (s) { return s.id === e.shift; })[0].name)) + (e.line ? ' <span class="muted small">· ' + e.line + '</span>' : ''); } },
        { key: 'hired', label: 'c.hired', end: true, sort: function (e) { return e.hireDate; }, cell: function (e) { return '<span class="num small">' + esc(date(e.hireDate)) + '</span>'; } },
        { key: 'status', label: 'c.status', sort: function (e) { return e.status; }, cell: function (e) { return statusChip(e.status); } },
      ],
    },
  };

  function listState(id) { return state.lists[id] || (state.lists[id] = { q: '', f: {}, sort: null, dir: 1, page: 1 }); }
  function listRows(id) {
    var def = LISTS[id], st = listState(id);
    var rows = def.rows();
    if (st.q) {
      var q = normalize(st.q.trim());
      rows = rows.filter(function (r) { return normalize(def.search(r)).indexOf(q) >= 0; });
    }
    def.filters.forEach(function (f) { var v = st.f[f.key]; if (v) rows = rows.filter(function (r) { return f.test(r, v); }); });
    if (st.sort) {
      var col = def.columns.filter(function (c) { return c.key === st.sort; })[0];
      rows = rows.slice().sort(function (a, b) { return cmp(col.sort(a), col.sort(b)) * st.dir; });
    }
    return rows;
  }
  function renderListPage(id) {
    var def = LISTS[id], st = listState(id);
    var filters = def.filters.map(function (f) {
      return '<select data-filter="' + f.key + '" data-list="' + id + '" aria-label="' + esc(t(f.label)) + '"><option value="">' + esc(t(f.label)) + ': ' + esc(t('all')) + '</option>' +
        f.options().map(function (o) { return '<option value="' + esc(o[0]) + '"' + (st.f[f.key] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    }).join('');
    return pageHead(t('p.' + id), t('p.' + id + '.sub'), 'g.master') +
      '<div class="toolbar"><label class="search">' + icon('search', 15) + '<input type="search" id="search-' + id + '" data-search="' + id + '" value="' + esc(st.q) + '" placeholder="' + esc(t('search')) + '" aria-label="' + esc(t('search')) + '"></label>' + filters + '</div>' +
      '<div id="listBody">' + renderListBody(id) + '</div>';
  }
  function renderListBody(id) {
    var def = LISTS[id], st = listState(id);
    var rows = listRows(id), total = def.rows().length;
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (st.page > pages) st.page = pages;
    var slice = rows.slice((st.page - 1) * PAGE_SIZE, st.page * PAGE_SIZE);
    var head = def.columns.map(function (c) {
      var active = st.sort === c.key;
      return '<th tabindex="0" class="sortable' + (c.end ? ' end' : '') + '" data-action="sort" data-list="' + id + '" data-key="' + c.key + '" aria-sort="' + (active ? (st.dir === 1 ? 'ascending' : 'descending') : 'none') + '">' + esc(t(c.label)) + (active ? '<span class="dir">' + (st.dir === 1 ? '▲' : '▼') + '</span>' : '') + '</th>';
    }).join('');
    var body = slice.map(function (r) {
      return '<tr class="row" tabindex="0" data-action="open" data-kind="' + def.kind + '" data-id="' + esc(r.id) + '">' +
        def.columns.map(function (c) { return '<td' + (c.end ? ' class="end"' : '') + '>' + c.cell(r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var note = def.note ? ' · ' + esc(def.note()) : '';
    return '<div class="table-wrap"><table><thead><tr>' + head + '</tr></thead><tbody>' +
      (slice.length ? body : '<tr><td colspan="' + def.columns.length + '"><div class="empty">' + esc(t('empty')) + '</div></td></tr>') + '</tbody></table>' +
      '<div class="pager"><span>' + esc(t('count', { shown: num(rows.length), total: num(total) })) + note + '</span>' +
      (pages > 1 ? '<span class="btns"><span>' + esc(t('pageOf', { p: num(st.page), n: num(pages) })) + '</span><button data-action="page" data-list="' + id + '" data-to="' + (st.page - 1) + '"' + (st.page <= 1 ? ' disabled' : '') + '>' + esc(t('prev')) + '</button><button data-action="page" data-list="' + id + '" data-to="' + (st.page + 1) + '"' + (st.page >= pages ? ' disabled' : '') + '>' + esc(t('next')) + '</button></span>' : '') +
      '</div></div>';
  }
  function refreshListBody(id) { var el = document.getElementById('listBody'); if (el) el.innerHTML = renderListBody(id); }

  // ================================================================ pages
  function pageHead(title, sub, groupKey, extra) {
    return '<header class="page-head"><div class="titles"><span class="eyebrow">' + esc(t(groupKey)) + '</span><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + (extra || '') + '</header>';
  }

  function renderProfile() {
    var c = DB.company, counts = DB.counts;
    var capDay = DB.lines.reduce(function (s, l) { return s + l.capacityM2Day; }, 0);
    var maxCap = Math.max.apply(null, DB.lines.map(function (l) { return l.capacityM2Day; }));
    var stats = [
      [num(capDay), t('profile.capDay')], [num(capDay * 330 / 1e6, 1), t('profile.capYear')], [num(DB.lines.length), t('profile.lines')],
      [num(counts.employees), t('profile.employees')], [num(counts.products), t('profile.products')], [num(counts.dealers), t('profile.dealers')],
      [num(counts.suppliers), t('profile.suppliers')], [num(counts.assets), t('profile.assets')],
    ].map(function (s) { return '<div class="stat"><span class="v">' + s[0] + '</span><span class="l">' + esc(s[1]) + '</span></div>'; }).join('');

    var lineRows = DB.lines.map(function (l) {
      return '<div class="bar-row"><span>' + esc(L(l.name)) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (l.capacityM2Day / maxCap * 100).toFixed(1) + '%"></div></div><span class="num" style="text-align:end">' + num(l.capacityM2Day) + ' ' + m2() + '</span></div>';
    }).join('');
    var lineTable = '<div class="mini" style="margin-top:12px"><table><thead><tr><th>' + esc(t('c.line')) + '</th><th>' + esc(t('profile.sizes')) + '</th><th>' + esc(t('profile.kiln')) + '</th></tr></thead><tbody>' +
      DB.lines.map(function (l) {
        return '<tr><td>' + esc(l.id) + '</td><td class="num">' + l.sizes.map(function (s) { return esc(L(DB.sizes[s].label)); }).join(' · ') + '</td><td class="small">' +
          esc(t('profile.kilnSpec', { len: num(l.kiln.lengthM), cyc: num(l.kiln.cycleMin), temp: num(l.kiln.maxTempC) })) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var packRows = Object.keys(DB.sizes).map(function (k) {
      var s = DB.sizes[k];
      return '<tr><td class="num">' + esc(L(s.label)) + '</td><td class="end num">' + num(s.pcs) + '</td><td class="end num">' + num(s.m2Box, 4) + '</td><td class="end num">' + num(s.kgBox) + '</td><td class="end num">' + num(s.boxesPallet) + '</td><td class="end num">' + num(s.m2Pallet, 2) + '</td></tr>';
    }).join('');
    var packTable = '<div class="mini"><table><thead><tr><th>' + esc(t('c.size')) + '</th><th class="end">' + esc(t('d.pcsBox')) + '</th><th class="end">' + esc(t('d.m2Box')) + '</th><th class="end">' + esc(t('d.kgBox')) + '</th><th class="end">' + esc(t('d.boxesPallet')) + '</th><th class="end">' + esc(t('d.m2Pallet')) + '</th></tr></thead><tbody>' + packRows + '</tbody></table></div>';

    var shifts = '<ul class="linklist">' + c.shifts.map(function (s) {
      var count = DB.employees.filter(function (e) { return e.shift === s.id; }).length;
      return '<li><span>' + esc(L(s.name)) + ' <span class="muted small num" dir="ltr">' + s.from + '–' + s.to + '</span></span><span class="num">' + num(count) + '</span></li>';
    }).join('') + '</ul>';

    var sites = '<ul class="linklist">' + DB.warehouses.map(function (w) {
      return '<li>' + openLink('warehouse', w.id, L(w.name)) + '<span class="muted small">' + esc(L(w.capacity)) + '</span></li>';
    }).join('') + '</ul>';

    var familyCounts = Object.keys(DB.families).map(function (k) {
      var n = DB.products.filter(function (p) { return p.family === k; }).length;
      return '<li><span>' + esc(L(DB.families[k].name)) + ' <span class="muted small">' + esc(DB.families[k].absorptionGroup) + '</span></span><span class="num">' + num(n) + '</span></li>';
    }).join('');

    var phases = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
    var roadmap = '<div class="roadmap">' + phases.map(function (p) {
      var now = p === 'A1';
      return '<div class="rm' + (now ? ' now' : '') + '"><span class="t"><span>' + esc(t('phase', { p: p })) + '</span>' + (now ? '<span class="phase-tag done">' + esc(t('ready')) + '</span>' : '') + '</span><p>' + esc(t('rm.' + p)) + '</p></div>';
    }).join('') + '</div>';

    return pageHead(L(c.name), L(c.location) + ' · ' + t('profile.founded', { y: year(c.founded) }), 'g.overview') +
      '<div class="stats">' + stats + '</div>' +
      '<div class="grid-2">' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('profile.linesTitle')) + '</h2></div><div class="bars">' + lineRows + '</div>' + lineTable + '</section>' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('profile.packing')) + '</h2></div><p class="muted small" style="margin-bottom:10px">' + esc(t('profile.packNote')) + '</p>' + packTable + '</section>' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('profile.families')) + '</h2><button class="link" data-action="nav" data-id="products">' + esc(t('open')) + '</button></div><ul class="linklist">' + familyCounts + '</ul>' +
          '<div class="section-title" style="margin-top:18px"><h2>' + esc(t('profile.shifts')) + '</h2></div>' + shifts + '</section>' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('profile.sites')) + '</h2></div>' + sites + '</section>' +
      '</div>' +
      '<section><div class="section-title"><h2>' + esc(t('profile.roadmap')) + '</h2></div>' + roadmap + '</section>';
  }

  function renderCodes() {
    var tabs = ['defects', 'downtime', 'tests'].map(function (k) {
      return '<button class="' + (state.codesTab === k ? 'active' : '') + '" data-action="codesTab" data-tab="' + k + '">' + esc(t('tab.' + k)) + '</button>';
    }).join('');
    var body;
    if (state.codesTab === 'defects') {
      body = '<table><thead><tr><th>' + esc(t('c.code')) + '</th><th>' + esc(t('c.name')) + '</th><th>' + esc(t('c.source')) + '</th></tr></thead><tbody>' +
        DB.codes.defects.map(function (d) { return '<tr><td class="mono">' + d.id + '</td><td>' + esc(L(d.name)) + '</td><td>' + chip(L(DB.codes.defectSources[d.source]), '', true) + '</td></tr>'; }).join('') + '</tbody></table>';
    } else if (state.codesTab === 'downtime') {
      body = '<table><thead><tr><th>' + esc(t('c.code')) + '</th><th>' + esc(t('c.name')) + '</th><th>' + esc(t('c.category')) + '</th><th>' + esc(t('c.planned')) + '</th></tr></thead><tbody>' +
        DB.codes.downtime.map(function (d) { return '<tr><td class="mono">' + d.id + '</td><td>' + esc(L(d.name)) + '</td><td>' + esc(L(DB.codes.downtimeCategories[d.category])) + '</td><td>' + (d.planned ? chip(t('yes'), 'accent') : chip(t('no'), '', true)) + '</td></tr>'; }).join('') + '</tbody></table>';
    } else {
      body = '<table><thead><tr><th>' + esc(t('c.code')) + '</th><th>' + esc(t('c.name')) + '</th><th>' + esc(t('c.stage')) + '</th><th>' + esc(t('c.standard')) + '</th><th>' + esc(t('c.unit')) + '</th>' +
        Object.keys(DB.families).map(function (k) { return '<th class="end">' + esc(L(DB.families[k].name)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        DB.codes.tests.map(function (q) {
          return '<tr><td class="mono">' + q.id + '</td><td>' + esc(L(q.name)) + '</td><td class="small">' + esc(L(DB.codes.testStages[q.stage])) + '</td><td class="small" dir="auto">' + esc(L(q.standard)) + '</td><td class="small">' + esc(L(q.unit)) + '</td>' +
            Object.keys(DB.families).map(function (k) { return '<td class="end num">' + specText(q.spec[k]) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    return pageHead(t('p.codes'), t('p.codes.sub'), 'g.master') + '<div class="tabs" role="tablist">' + tabs + '</div><div class="table-wrap">' + body + '</div>';
  }

  function renderPlanned(m) {
    var ready = m.uses.map(function (id) {
      var mm = MASTER.filter(function (x) { return x.id === id; })[0];
      return '<button data-action="nav" data-id="' + id + '">' + icon(mm.icon, 14) + ' ' + esc(t('p.' + id)) + '</button>';
    }).join('');
    return pageHead(L(m.name), t('planned.lead', { p: m.phase }), 'g.' + m.group, '<span class="phase-tag">' + esc(t('phase', { p: m.phase })) + '</span>') +
      '<div class="planned">' +
        '<section class="card"><h3 style="margin-bottom:10px">' + esc(t('planned.screens')) + '</h3><ul>' + m.screens.map(function (s) { return '<li>' + esc(L(s)) + '</li>'; }).join('') + '</ul></section>' +
        '<section class="card"><h3 style="margin-bottom:10px">' + esc(t('planned.kpis')) + '</h3><ul>' + m.kpis.map(function (s) { return '<li>' + esc(L(s)) + '</li>'; }).join('') + '</ul></section>' +
      '</div>' +
      '<section class="card"><h3 style="margin-bottom:10px">' + esc(t('planned.ready')) + '</h3><div class="ready-links">' + ready + '</div></section>';
  }

  // ================================================================ drawers
  function drawerFrame(kindKey, title, chips, body) {
    var canBack = state.drawer.length > 1;
    return '<div class="drawer-scrim" data-action="closeDrawer"></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="drawer-head">' +
          (canBack ? '<button class="icon-btn" data-action="drawerBack" aria-label="' + esc(t('back')) + '">' + icon('back', 18) + '</button>' : '') +
          '<div class="titles"><span class="eyebrow">' + esc(t(kindKey)) + '</span><h2>' + esc(title) + '</h2><div style="display:flex;flex-wrap:wrap;gap:6px">' + chips + '</div></div>' +
          '<button class="icon-btn" id="drawerClose" data-action="closeDrawer" aria-label="' + esc(t('close')) + '">' + icon('close', 18) + '</button>' +
        '</div>' +
        '<div class="drawer-body">' + body + '</div>' +
      '</aside>';
  }

  var DRAWERS = {
    product: function (p) {
      var s = DB.sizes[p.sizeId];
      var gradeHead = DB.grades.map(function (g) { return '<th class="end">' + esc(L(g.name)) + '</th>'; }).join('');
      var priceRows = DB.priceLists.map(function (pl) {
        if (pl.currency === 'USD') return '';
        return '<tr><td>' + esc(L(pl.name)) + '</td>' + DB.grades.map(function (g) {
          var v = Math.round(price(p, g.id) * pl.factor / 5) * 5;
          return '<td class="end num">' + num(v) + '<br><span class="muted small">' + num(v * s.m2Box) + ' ' + esc(t('d.perBox')) + '</span></td>';
        }).join('') + '</tr>';
      }).join('');
      var g1 = price(p, 'G1');
      var margin = (g1 - p.stdCostPerM2) / g1 * 100;
      var body = block(t('d.packing'), facts([
        [t('d.pcsBox'), num(s.pcs)], [t('d.m2Box'), num(s.m2Box, 4)], [t('d.kgBox'), num(s.kgBox) + ' ' + (state.locale === 'ar' ? 'كجم' : 'kg')],
        [t('d.boxesPallet'), num(s.boxesPallet)], [t('d.m2Pallet'), num(s.m2Pallet, 2)], [t('d.thickness'), num(s.thicknessMm, 1) + ' ' + (state.locale === 'ar' ? 'مم' : 'mm')],
      ])) +
        block(t('d.prices') + ' (' + t('perM2') + ')', '<div class="mini"><table><thead><tr><th></th>' + gradeHead + '</tr></thead><tbody>' + priceRows + '</tbody></table></div>') +
        facts([[t('c.cost'), money(p.stdCostPerM2)], [t('d.margin'), num(margin, 1) + pct()]]) +
        block(t('d.production'), facts([
          [t('c.line'), esc(L(LINE[p.line].name))],
          [t('d.bodyRecipe'), openLink('recipe', p.bodyRecipe, L(by.recipes[p.bodyRecipe].name) + ' v' + by.recipes[p.bodyRecipe].version)],
          [t('d.glazeRecipe'), openLink('recipe', p.glazeRecipe, L(by.recipes[p.glazeRecipe].name) + ' v' + by.recipes[p.glazeRecipe].version)],
          [t('d.faces'), num(p.faces)],
          [t('d.ink') + ' / ' + t('d.glazeWeight'), num(p.inkGramsPerM2) + ' / ' + num(p.glazeGramsPerM2) + ' ' + (state.locale === 'ar' ? 'جم/م²' : 'g/m²')],
          [t('d.absorption'), esc(p.absorptionGroup + ' · ' + L(DB.families[p.family].absorption))],
          p.pei ? [t('d.pei'), esc(p.pei)] : null,
          p.slipRating ? [t('d.slip'), esc(p.slipRating)] : null,
          [t('d.launched'), esc(date(p.launched))],
        ]));
      return drawerFrame('k.product', L(p.name), '<span class="chip plain mono">' + esc(p.code) + '</span>' + statusChip(p.status) + chip(L(DB.families[p.family].name), 'glaze', true), body);
    },
    material: function (m) {
      var used = allRecipes.filter(function (r) { return r.lines.some(function (l) { return l[0] === m.id; }); });
      var usedHtml = used.length ? '<ul class="linklist">' + used.map(function (r) {
        var share = r.lines.filter(function (l) { return l[0] === m.id; })[0][1];
        return '<li>' + openLink('recipe', r.id, L(r.name) + ' v' + r.version) + '<span class="num">' + num(share) + pct() + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted small">—</p>';
      var body = facts([
        [t('c.category'), esc(L(DB.materialCategories[m.category]))], [t('c.unit'), esc(unit(m.unit))],
        [t('c.origin'), esc(L(DB.origins[m.origin]))], [t('c.supplier'), m.supplierId ? openLink('supplier', m.supplierId, supplierName(m.supplierId)) : esc(t('origin.local'))],
        [t('c.stdCost'), money(m.stdCost) + ' / ' + esc(unit(m.unit))], [t('c.minStock'), num(m.minStock) + ' ' + esc(unit(m.unit))],
        [t('d.leadTime'), days(m.leadTimeDays)], [L(b('المخزن', 'Store')), openLink('warehouse', m.warehouseId, L(by.warehouses[m.warehouseId].name))],
      ]) + block(t('d.usedIn'), usedHtml);
      return drawerFrame('k.material', L(m.name), '<span class="chip plain mono">' + esc(m.code) + '</span>' + (m.imported ? chip(t('origin.imported'), 'accent') : chip(t('origin.local'), '', true)), body);
    },
    recipe: function (r) {
      var segs = r.lines.map(function (l, i) { return '<span style="width:' + l[1] + '%;background:' + SWATCH[i % SWATCH.length] + '" title="' + esc(L(by.materials[l[0]].name)) + ' ' + l[1] + '%"></span>'; }).join('');
      var legend = '<ul class="legend">' + r.lines.map(function (l, i) {
        return '<li><i style="background:' + SWATCH[i % SWATCH.length] + '"></i>' + openLink('material', l[0], L(by.materials[l[0]].name)) + '<span class="pct">' + num(l[1]) + pct() + '</span></li>';
      }).join('') + '</ul>';
      var tg = r.targets, targetFacts;
      if (r.kind === 'body') {
        targetFacts = facts([
          [t('d.slipDensity'), num(tg.slipDensity[0]) + ' – ' + num(tg.slipDensity[1])], [t('d.residue'), num(tg.residue63[0], 1) + ' – ' + num(tg.residue63[1], 1)],
          [t('d.powderMoisture'), num(tg.powderMoisture[0], 1) + ' – ' + num(tg.powderMoisture[1], 1)], [t('d.slipWater'), num(tg.slipWaterPct)],
        ]);
      } else {
        targetFacts = facts([[t('d.density'), num(tg.density[0]) + ' – ' + num(tg.density[1])], [t('d.viscosity'), num(tg.viscositySec[0]) + ' – ' + num(tg.viscositySec[1])]]);
      }
      var additives = r.additives ? block(t('d.additives'), '<ul class="linklist">' + r.additives.map(function (a) { return '<li>' + openLink('material', a[0], L(by.materials[a[0]].name)) + '<span class="num">' + num(a[1], 2) + pct() + '</span></li>'; }).join('') + '</ul>') : '';
      var prods = productsUsingRecipe(r.id);
      var body = block(t('d.composition'), '<div class="comp">' + segs + '</div>' + legend) + additives + block(t('d.targets'), targetFacts) +
        block(t('d.productsUsing') + ' (' + num(prods.length) + ')', '<ul class="linklist">' + prods.map(function (p) { return '<li>' + openLink('product', p.id, L(p.name)) + '<span class="mono muted">' + esc(p.code) + '</span></li>'; }).join('') + '</ul>');
      var chips = '<span class="chip plain mono">' + esc(r.id) + ' v' + r.version + '</span>' + chip(t(r.kind), r.kind === 'body' ? 'glaze' : 'accent', true) + (r.effectiveFrom ? chip(t('c.effective') + ' ' + date(r.effectiveFrom), '', true) : '');
      return drawerFrame('k.recipe', L(r.name), chips, body);
    },
    asset: function (a) {
      var parts = DB.spareParts.filter(function (p) { return p.assetType === a.type; });
      var generic = DB.spareParts.filter(function (p) { return p.assetType === '*'; }).length;
      var next;
      if (a.pmBasis === 'calendar') {
        var due = new Date(Date.parse(a.lastPm + 'T00:00:00Z') + a.pmInterval * 864e5).toISOString().slice(0, 10);
        next = esc(date(due)) + (due < DB.referenceDate ? ' <span class="chip bad">' + esc(t('pm.overdue')) + '</span>' : '');
      } else {
        next = esc(t('pm.atMeter', { n: num(Math.ceil((a.meter + 1) / a.pmInterval) * a.pmInterval), u: t('pm.unit.' + a.pmBasis) }));
      }
      var body = facts([
        [t('c.area'), esc(L(DB.areas[a.area]))], [t('c.maker'), '<span dir="ltr">' + esc(a.maker + ' ' + a.model) + '</span>'],
        [t('c.year'), year(a.year)], [t('c.crit'), esc(a.criticality)],
        a.lengthM ? [L(b('طول الفرن', 'Kiln length')), num(a.lengthM) + (state.locale === 'ar' ? ' م' : ' m')] : null,
      ]) + block(t('d.pmPlan'), facts([
        [t('c.pm'), esc(t('pm.' + a.pmBasis, { n: num(a.pmInterval) }))],
        a.meter != null ? [t('d.meter'), num(a.meter) + ' ' + esc(t('pm.unit.' + a.pmBasis))] : null,
        [t('d.lastPm'), esc(date(a.lastPm))], [t('d.nextPm'), next],
      ])) + block(t('d.parts') + ' (' + num(parts.length) + ')', parts.length ? '<ul class="linklist">' + parts.slice(0, 14).map(function (p) {
        return '<li>' + openLink('part', p.id, L(p.name)) + '<span class="num">' + num(p.onHand) + ' / ' + num(p.minStock) + '</span></li>';
      }).join('') + '</ul><p class="muted small">' + esc(t('d.genericParts', { n: num(generic) })) + '</p>' : '<p class="muted small">' + esc(t('d.genericParts', { n: num(generic) })) + '</p>');
      return drawerFrame('k.asset', L(DB.assetTypes[a.type]), '<span class="chip plain mono">' + esc(a.code) + '</span>' + statusChip(a.status), body);
    },
    part: function (p) {
      var assets = p.assetType === '*' ? [] : DB.assets.filter(function (a) { return a.type === p.assetType; });
      var body = facts([
        [t('c.for'), esc(p.assetType === '*' ? t('anyEquipment') : L(DB.assetTypes[p.assetType]))], [t('c.unit'), esc(unit(p.unit))],
        [t('c.stock'), num(p.onHand) + ' / ' + num(p.minStock)], [t('c.stdCost'), money(p.unitCost)],
        [t('d.stockValue'), money(p.onHand * p.unitCost)], [t('c.bin'), '<span class="mono">' + esc(p.bin) + '</span>'],
        [t('c.supplier'), openLink('supplier', p.supplierId, supplierName(p.supplierId))], [t('d.leadTime'), days(p.leadTimeDays)],
      ]) + (assets.length ? block(t('d.compatible') + ' (' + num(assets.length) + ')', '<ul class="linklist">' + assets.map(function (a) { return '<li>' + openLink('asset', a.id, a.code) + '<span class="small muted">' + esc(L(DB.areas[a.area])) + '</span></li>'; }).join('') + '</ul>') : '');
      return drawerFrame('k.part', L(p.name), '<span class="chip plain mono">' + esc(p.id) + '</span>' + (p.onHand < p.minStock ? chip(t('s.belowMin'), 'bad') : chip(t('s.ok'), 'pos')) + (p.critical ? chip(t('s.critical'), 'warn', true) : ''), body);
    },
    warehouse: function (w) {
      var mats = DB.materials.filter(function (m) { return m.warehouseId === w.id; });
      var contents = '';
      if (mats.length) contents += '<ul class="linklist">' + mats.slice(0, 16).map(function (m) { return '<li>' + openLink('material', m.id, L(m.name)) + '<span class="mono muted">' + esc(m.code) + '</span></li>'; }).join('') + '</ul>' + (mats.length > 16 ? '<p class="muted small">+ ' + num(mats.length - 16) + '</p>' : '');
      if (w.id === 'WH-SP') {
        var low = DB.spareParts.filter(function (p) { return p.onHand < p.minStock; }).length;
        contents += '<p>' + esc(t('d.itemsCount', { n: num(DB.spareParts.length) })) + ' · ' + chip(t('d.belowMinCount', { n: num(low) }), 'bad') + '</p><p>' + '<button class="link" data-action="nav" data-id="spareParts">' + esc(t('p.spareParts')) + '</button></p>';
      }
      if (w.type === 'finished') contents += '<p class="muted">' + esc(t('d.fgLater')) + '</p>';
      var body = facts([
        [t('c.site'), esc(L(DB.sites.filter(function (s) { return s.id === w.site; })[0].name))], [t('c.keeper'), openLink('employee', w.keeperId, L(by.employees[w.keeperId].name))],
        [t('c.locations'), num(w.locations)], [t('c.capacity'), esc(L(w.capacity))], [t('c.areaM2'), num(w.areaM2)],
      ]) + block(t('d.contents'), contents || '<p class="muted small">—</p>');
      return drawerFrame('k.warehouse', L(w.name), '<span class="chip plain mono">' + esc(w.id) + '</span>', body);
    },
    supplier: function (s) {
      var mats = s.materialIds.map(function (id) { return by.materials[id]; });
      var spares = DB.spareParts.filter(function (p) { return p.supplierId === s.id; }).length;
      var body = facts([
        [t('c.category'), esc(L(DB.supplierCategories[s.category]))], [t('c.country'), esc(L(DB.origins[s.country]) + ' · ' + L(s.city))],
        [t('c.terms'), esc(s.paymentTermsDays ? days(s.paymentTermsDays) : L(s.paymentMethod))], [t('d.paymentMethod'), esc(L(s.paymentMethod))],
        [t('c.rating'), esc(s.rating)], [t('d.leadTime'), days(s.leadTimeDays)], [t('d.since'), year(s.since)],
      ]) + block(t('d.supplied'), (mats.length ? '<ul class="linklist">' + mats.map(function (m) { return '<li>' + openLink('material', m.id, L(m.name)) + '<span class="num small">' + num(m.stdCost) + ' / ' + esc(unit(m.unit)) + '</span></li>'; }).join('') + '</ul>' : '') +
        (spares ? '<p class="small">' + esc(t('d.sparesSupplied', { n: num(spares) })) + '</p>' : '') + (!mats.length && !spares ? '<p class="muted small">—</p>' : ''));
      return drawerFrame('k.supplier', L(s.name), '<span class="chip plain mono">' + esc(s.id) + '</span>' + chip(s.country === 'EG' ? t('origin.local') : t('origin.imported'), s.country === 'EG' ? '' : 'accent', s.country === 'EG'), body);
    },
    dealer: function (d) {
      var pl = DB.priceLists.filter(function (x) { return x.id === d.priceList; })[0];
      var body = facts([
        [t('c.type'), esc(L(DB.dealerTypes[d.type]))], [t('c.gov'), esc(L(d.governorate))], [t('c.region'), esc(L(DB.regions[d.region]))],
        [t('c.rep'), d.repId ? openLink('employee', d.repId, L(by.employees[d.repId].name)) : '—'],
        [t('c.credit'), d.creditLimit ? money(d.creditLimit) : '—'], [t('c.terms'), esc(d.paymentTermsDays ? days(d.paymentTermsDays) : L(d.paymentMethod))],
        [t('d.priceList'), esc(L(pl.name))], [t('c.class'), esc(d.class)], [t('c.target'), num(d.annualTargetM2) + ' ' + m2()], [t('d.since'), year(d.since)],
      ]) + block(t('d.account'), '<p class="muted">' + esc(t('d.salesLater')) + '</p>');
      return drawerFrame('k.dealer', L(d.name), '<span class="chip plain mono">' + esc(d.id) + '</span>' + statusChip(d.status), body);
    },
    employee: function (e) {
      var years = (Date.parse(DB.referenceDate) - Date.parse(e.hireDate)) / (365.25 * 864e5);
      var repDealers = DB.dealers.filter(function (d) { return d.repId === e.id; });
      var body = facts([
        [t('c.dept'), esc(L(by.departments[e.departmentId].name))], [t('c.title'), esc(L(e.title))], [t('c.level'), esc(t('lvl.' + e.level))],
        [t('c.shift'), esc(L(DB.company.shifts.filter(function (s) { return s.id === e.shift; })[0].name)) + (e.line ? ' · ' + esc(L(LINE[e.line].name)) : '')],
        [t('c.hired'), esc(date(e.hireDate))], [t('d.tenure'), esc(t('d.years', { n: num(years, 1) }))],
        e.region ? [t('c.region'), esc(L(DB.regions[e.region]))] : null,
      ]) + (repDealers.length ? block(t('p.dealers') + ' (' + num(repDealers.length) + ')', '<ul class="linklist">' + repDealers.map(function (d) { return '<li>' + openLink('dealer', d.id, L(d.name)) + '<span class="small muted">' + esc(L(d.governorate)) + '</span></li>'; }).join('') + '</ul>') : '');
      return drawerFrame('k.employee', L(e.name), '<span class="chip plain mono">' + esc(e.id) + '</span>' + statusChip(e.status), body);
    },
  };
  var KIND_SOURCE = { product: 'products', material: 'materials', recipe: 'recipes', asset: 'assets', part: 'spareParts', warehouse: 'warehouses', supplier: 'suppliers', dealer: 'dealers', employee: 'employees' };

  function renderDrawer() {
    var top = state.drawer[state.drawer.length - 1];
    if (!top) return '';
    var rec = by[KIND_SOURCE[top.kind]][top.id];
    return rec ? DRAWERS[top.kind](rec) : '';
  }

  // ================================================================ shell
  function navItem(id, iconName, label, phase) {
    var active = state.page === id;
    return '<button class="nav-item' + (active ? ' active' : '') + (phase ? ' pending' : '') + '" data-action="nav" data-id="' + id + '"' + (active ? ' aria-current="page"' : '') + '>' +
      icon(iconName, 16) + '<span class="label">' + esc(label) + '</span>' + (phase ? '<span class="phase-tag">' + phase + '</span>' : '') + '</button>';
  }
  function renderNav() {
    return GROUPS.map(function (g) {
      var items = '';
      if (g === 'overview') items += navItem('profile', 'home', t('profile.title'));
      MODULES.filter(function (m) { return m.group === g; }).forEach(function (m) { items += navItem(m.id, m.icon, L(m.name), m.phase); });
      if (g === 'master') MASTER.forEach(function (m) { items += navItem(m.id, m.icon, t('p.' + m.id)); });
      return '<div class="nav-group"><div class="nav-group-title">' + esc(t('g.' + g)) + '</div>' + items + '</div>';
    }).join('');
  }
  function effectiveTheme() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function themeButton() {
    return '<button class="icon-btn" data-action="theme" aria-label="' + esc(t('theme')) + '" title="' + esc(t('theme')) + '">' + icon(effectiveTheme() === 'dark' ? 'sun' : 'moon', 17) + '</button>';
  }
  function langButton() {
    var other = state.locale === 'ar' ? 'English' : 'العربية';
    return '<button class="icon-btn" data-action="locale" aria-label="' + other + '" title="' + other + '"><span style="font-size:12px;font-weight:700">' + (state.locale === 'ar' ? 'EN' : 'ع') + '</span></button>';
  }
  function renderPage() {
    if (state.page === 'profile') return renderProfile();
    if (state.page === 'codes') return renderCodes();
    if (LISTS[state.page]) return renderListPage(state.page);
    if (MODULE_BY_ID[state.page]) return renderPlanned(MODULE_BY_ID[state.page]);
    return renderProfile();
  }
  function renderShell() {
    var initials = L(currentUser.name).split(' ').slice(0, 2).map(function (w) { return w.charAt(0); }).join('');
    return '<div class="shell">' +
      '<div class="scrim' + (state.navOpen ? ' open' : '') + '" data-action="menu"></div>' +
      '<aside class="sidebar' + (state.navOpen ? ' open' : '') + '" aria-label="' + esc(t('menu')) + '">' +
        '<div class="brand"><span class="mark">' + icon('tile', 16) + '</span><span class="name">' + esc(L(DB.company.name)) + '<span class="sub">' + esc(t('brand.sub')) + '</span></span></div>' +
        '<nav class="nav">' + renderNav() + '</nav>' +
      '</aside>' +
      '<div class="main">' +
        '<header class="topbar">' +
          '<div class="start"><button class="icon-btn menu-btn" data-action="menu" aria-label="' + esc(t('menu')) + '">' + icon('menu', 18) + '</button><span class="crumb"><span class="co">' + esc(L(DB.company.name)) + ' / </span><b>' + esc(pageTitle(state.page)) + '</b></span></div>' +
          '<div class="end">' + themeButton() + langButton() +
            '<span class="user"><span class="avatar">' + esc(initials) + '</span><span class="who">' + esc(L(currentUser.name)) + '<small>' + esc(L(currentUser.title)) + '</small></span></span>' +
            '<button class="icon-btn" data-action="signOut" aria-label="' + esc(t('signOut')) + '" title="' + esc(t('signOut')) + '">' + icon('logout', 16) + '</button>' +
          '</div>' +
        '</header>' +
        '<main class="content" id="content">' +
          '<div class="demo-note"><b>' + esc(t('demo.tag')) + '</b><span>' + esc(t('demo.note')) + '</span></div>' +
          renderPage() +
        '</main>' +
      '</div>' +
    '</div>' + renderDrawer();
  }
  function renderLogin() {
    return '<div class="floating">' + themeButton() + langButton() + '</div>' +
      '<main class="login"><form class="card" data-form="login">' +
        '<div class="brand" style="border:none;padding:0;height:auto"><span class="mark">' + icon('tile', 16) + '</span><span class="name">' + esc(L(DB.company.name)) + '<span class="sub">' + esc(t('brand.sub')) + '</span></span></div>' +
        '<h1 style="font-size:24px">' + esc(t('login.title')) + '</h1>' +
        '<label>' + esc(t('login.email')) + '<input type="email" dir="ltr" value="plant.manager@nova.example" autocomplete="off"></label>' +
        '<label>' + esc(t('login.password')) + '<input type="password" dir="ltr" value="demo-demo" autocomplete="off"></label>' +
        '<button class="primary" type="submit">' + esc(t('signIn')) + '</button>' +
        '<p class="muted small">' + esc(t('login.hint')) + '</p>' +
      '</form></main>';
  }

  function render(keepScroll) {
    var root = document.getElementById('app');
    document.documentElement.setAttribute('lang', state.locale);
    document.documentElement.setAttribute('dir', state.locale === 'ar' ? 'rtl' : 'ltr');
    document.title = L(DB.company.name) + ' — ' + (state.signedIn ? pageTitle(state.page) : t('login.title'));
    var y = window.scrollY;
    root.innerHTML = state.signedIn ? renderShell() : renderLogin();
    syncBodyLock();
    if (keepScroll) window.scrollTo(0, y);
  }
  function syncBodyLock() { document.body.classList.toggle('locked', state.drawer.length > 0 || state.navOpen); }
  function rerenderDrawer() {
    syncBodyLock();
    var old = document.querySelectorAll('.drawer, .drawer-scrim');
    old.forEach(function (n) { n.remove(); });
    var html = renderDrawer();
    if (html) {
      document.getElementById('app').insertAdjacentHTML('beforeend', html);
      var c = document.getElementById('drawerClose');
      if (c) c.focus();
    }
  }

  // ================================================================ events
  var lastFocus = null;
  var ACTIONS = {
    nav: function (el) {
      var id = el.getAttribute('data-id');
      if (!pageExists(id)) return;
      state.page = id; state.navOpen = false; state.drawer = [];
      try { history.replaceState(null, '', '#' + id); } catch (e) { /* sandboxed: ignore */ }
      render();
      window.scrollTo(0, 0);
    },
    menu: function () { state.navOpen = !state.navOpen; render(true); },
    theme: function () {
      var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('nova-theme', next); } catch (e) { /* ignore */ }
      render(true);
    },
    locale: function () {
      state.locale = state.locale === 'ar' ? 'en' : 'ar';
      try { localStorage.setItem('nova-locale', state.locale); } catch (e) { /* ignore */ }
      render(true);
    },
    signOut: function () { state.signedIn = false; state.drawer = []; render(); },
    open: function (el) {
      var item = { kind: el.getAttribute('data-kind'), id: el.getAttribute('data-id') };
      if (el.closest('.drawer')) state.drawer.push(item);
      else { lastFocus = el; state.drawer = [item]; }
      rerenderDrawer();
    },
    closeDrawer: function () {
      state.drawer = [];
      rerenderDrawer();
      if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
    },
    drawerBack: function () { state.drawer.pop(); rerenderDrawer(); },
    sort: function (el) {
      var id = el.getAttribute('data-list'), key = el.getAttribute('data-key'), st = listState(id);
      if (st.sort === key) st.dir = -st.dir; else { st.sort = key; st.dir = 1; }
      refreshListBody(id);
    },
    page: function (el) {
      var id = el.getAttribute('data-list');
      listState(id).page = Number(el.getAttribute('data-to'));
      refreshListBody(id);
    },
    codesTab: function (el) { state.codesTab = el.getAttribute('data-tab'); render(true); },
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = ACTIONS[el.getAttribute('data-action')];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.drawer.length) { ACTIONS.closeDrawer(); return; }
    if (e.key === 'Escape' && state.navOpen) { ACTIONS.menu(); return; }
    if (e.key === 'Tab' && state.drawer.length) {
      var drawer = document.querySelector('.drawer');
      var focusables = drawer ? drawer.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])') : [];
      if (focusables.length) {
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (!drawer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    // Rows and sortable headers act like buttons from the keyboard.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-action], th[data-action]')) {
      e.preventDefault();
      ACTIONS[e.target.getAttribute('data-action')](e.target, e);
    }
  });
  document.addEventListener('input', function (e) {
    var id = e.target.getAttribute && e.target.getAttribute('data-search');
    if (!id) return;
    var st = listState(id);
    st.q = e.target.value; st.page = 1;
    refreshListBody(id);
  });
  document.addEventListener('change', function (e) {
    var key = e.target.getAttribute && e.target.getAttribute('data-filter');
    if (!key) return;
    var id = e.target.getAttribute('data-list'), st = listState(id);
    st.f[key] = e.target.value; st.page = 1;
    refreshListBody(id);
  });
  document.addEventListener('submit', function (e) {
    if (e.target.getAttribute('data-form') === 'login') { e.preventDefault(); state.signedIn = true; render(); }
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () { if (!document.documentElement.getAttribute('data-theme')) render(true); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
  }

  var fromHash = (location.hash || '').slice(1);
  if (pageExists(fromHash)) state.page = fromHash;
  render();
})();
