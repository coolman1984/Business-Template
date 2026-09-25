/* Ceramica Nova demo — phase A1: shell, navigation, master data. Needs data.js loaded first. */
(function () {
  'use strict';

  var DB = globalThis.CeramicData.generate();
  var PAGE_SIZE = 25;
  var DONE_PHASES = ['A1', 'A2', 'A3'];

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
      'c.date': 'التاريخ', 'c.product': 'المنتج', 'c.pressedM2': 'مكبوس م²', 'c.kilnOutM2': 'خارج الفرن م²', 'c.firstPct': 'فرز أول٪', 'c.downtimeMin': 'توقف (دقيقة)', 'c.gasM3': 'غاز م³',
      'c.test': 'الاختبار', 'c.value': 'القيمة', 'c.result': 'النتيجة', 'c.ref': 'المرجع',
      'c.lot': 'اللوط', 'c.grade': 'الفرز', 'c.shade': 'درجة اللون', 'c.m2': 'م²', 'c.available': 'المتاح',
      // statuses
      's.active': 'نشط', 's.new': 'جديد', 's.discontinued': 'متوقف', 's.running': 'شغال', 's.maintenance': 'في الصيانة', 's.standby': 'احتياطي', 's.onLeave': 'إجازة', 's.suspended': 'موقوف',
      's.creditHold': 'موقوف ائتمانيًا', 's.inactive': 'غير نشط', 's.belowMin': 'تحت الحد', 's.ok': 'كافي', 's.critical': 'حرجة', 's.pass': 'مطابق', 's.fail': 'غير مطابق',
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
      'p.shiftReports': 'تقارير الورديات', 'p.shiftReports.sub': 'إنتاج كل وردية على كل خط، بالفرز والتوقف واستهلاك الغاز.',
      'p.labTests': 'اختبارات المعمل', 'p.labTests.sub': 'اختبارات الخامات الواردة وأثناء التشغيل والمنتج التام بنتائجها.',
      'tab.defects': 'أكواد العيوب', 'tab.downtime': 'أسباب التوقف', 'tab.tests': 'اختبارات الجودة',
      // A2 dashboards
      'exec.sub': 'لوحة صباحية: الإنتاج والفرز والمبيعات والتحصيل والتنبيهات اللي محتاجة قرار.',
      'exec.kpi.todayM2': 'م² خارج الفرن اليوم', 'exec.kpi.first7': 'فرز أول (٧ أيام)', 'exec.kpi.sold30': 'م² مباعة (٣٠ يوم)', 'exec.kpi.revenue30': 'مبيعات (٣٠ يوم)',
      'exec.kpi.gas7': 'غاز لكل م² (٧ أيام)', 'exec.gasUnit': 'م³/م²', 'exec.kpi.creditHold': 'تجار موقوفين ائتمانيًا', 'exec.kpi.openWork': 'أوامر شغل مفتوحة', 'exec.kpi.openSafety': 'حوادث سلامة مفتوحة',
      'exec.trendTitle': 'إنتاج خارج الفرن — آخر ٤٥ يوم', 'exec.regionTitle': 'المبيعات حسب المنطقة (٣٠ يوم)', 'exec.alertsTitle': 'تنبيهات محتاجة قرار',
      'exec.alert.creditHold': '{n} تاجر موقوف ائتمانيًا', 'exec.alert.blockedOrders': 'طلبيات محجوزة بسبب الائتمان', 'exec.alert.awaitingPO': '{n} طلب شراء مستني اعتماد',
      'exec.alert.openWork': '{n} أمر شغل صيانة مفتوح', 'exec.alert.openSafety': '{n} حادث سلامة مفتوح', 'dash.noAlerts': 'كل حاجة تمام، مفيش تنبيهات دلوقتي.', 'common.dash': 'مفيش بيانات كفاية لسه.',
      'prod.sub': 'كفاءة الخطوط والتوقف والفرز الأول على مستوى آخر أسبوع.', 'prod.kpi.kilnOut7': 'خارج الفرن م² (٧ أيام)', 'prod.kpi.first7': 'فرز أول (٧ أيام)',
      'prod.kpi.utilization': 'استغلال الطاقة', 'prod.kpi.downHours': 'ساعات التوقف (٧ أيام)', 'prod.hoursUnit': 'ساعة', 'prod.minUnit': 'دقيقة',
      'prod.byLineTitle': 'الإنتاج حسب الخط (٧ أيام)', 'prod.downtimeTitle': 'التوقف حسب السبب (٣٠ يوم)', 'prod.trendTitle': 'دقائق التوقف اليومية — آخر ٤٥ يوم', 'prod.shiftLogTitle': 'سجل تقارير الورديات',
      'qual.sub': 'نسبة نجاح الاختبارات وأكثر العيوب تكرارًا والتقارير المفتوحة.', 'qual.kpi.first7': 'فرز أول (٧ أيام)', 'qual.kpi.passRate30': 'نجاح الاختبارات (٣٠ يوم)',
      'qual.kpi.openNcr': 'تقارير عدم مطابقة مفتوحة', 'qual.kpi.downgraded30': 'م² متنازل عنها (٣٠ يوم)', 'qual.defectTitle': 'أكثر العيوب (٣٠ يوم)', 'qual.passTrendTitle': 'نسبة نجاح اختبار المنتج التام — آخر ٤٥ يوم',
      'qual.ncrTitle': 'تقارير عدم المطابقة المفتوحة', 'qual.noNcr': 'مفيش تقارير عدم مطابقة مفتوحة.', 'qual.labLogTitle': 'سجل اختبارات المعمل',
      // A3 pages
      'c.mill': 'الطاحونة', 'c.recipe': 'التركيبة', 'c.week': 'بداية الأسبوع', 'qc.offSpec': 'خارج المواصفة',
      'plan.sub': 'الخطة الأسبوعية لكل خط مقابل المنفذ فعليًا.', 'plan.kpi.adherence': 'الالتزام بالخطة (الأسبوع الحالي)', 'plan.kpi.actual': 'المنفذ (الأسبوع الحالي)',
      'plan.kpi.planned': 'المخطط (الأسبوع الحالي)', 'plan.kpi.behind': 'خطوط متأخرة عن الخطة', 'plan.byLineTitle': 'الالتزام بالخطة حسب الخط (الأسبوع الحالي)',
      'plan.tableTitle': 'الخطة الأسبوعية لكل خط', 'plan.plannedM2': 'مخطط م²', 'plan.actualM2': 'منفذ م²', 'plan.adherence': 'الالتزام', 'plan.upcoming': 'قادم',
      'prep.sub': 'تشغيلات الطواحين وتقرير الأتومايزر مقابل القيم المستهدفة.', 'prep.kpi.batches7': 'تشغيلات طاحونة (٧ أيام)', 'prep.kpi.tonnesDay': 'متوسط طن/يوم',
      'prep.tonUnit': 'طن', 'prep.kpi.moisture': 'متوسط رطوبة البودرة', 'prep.kpi.offSpec': 'تشغيلات خارج المواصفة', 'prep.millTitle': 'تشغيلات الطواحين (٧ أيام)',
      'prep.chargeT': 'الشحنة (طن)', 'prep.atomTitle': 'تقرير الأتومايزر (٧ أيام)', 'prep.throughputT': 'الإنتاجية (طن)',
      'glaze.sub': 'تشغيلات الجليز والإنجوب مقابل القيم المستهدفة.', 'glaze.kpi.batches7': 'تشغيلات جليز (٧ أيام)', 'glaze.kpi.kg7': 'كجم جليز (٧ أيام)',
      'glaze.kpi.offSpec': 'تشغيلات خارج المواصفة', 'glaze.tableTitle': 'تشغيلات الجليز (٧ أيام)', 'glaze.kg': 'الشحنة (كجم)',
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
      'd.pressed': 'مكبوس', 'd.kilnIn': 'داخل الفرن', 'd.kilnOut': 'خارج الفرن', 'd.first': 'فرز أول', 'd.commercial': 'تجاري', 'd.second': 'فرز ثاني', 'd.downtimeMin': 'دقائق التوقف',
      'd.gas': 'استهلاك الغاز', 'd.supervisor': 'مشرف الوردية', 'd.downtimeEvents': 'أحداث التوقف', 'd.shiftDefects': 'العيوب المسجلة', 'd.testStandard': 'المعيار', 'd.testSpec': 'المواصفة',
      'd.testValue': 'القيمة المقاسة', 'd.testRef': 'المرجع', 'd.testBy': 'قام بالاختبار',
      'k.product': 'منتج', 'k.material': 'خامة', 'k.recipe': 'تركيبة', 'k.asset': 'معدة', 'k.part': 'قطعة غيار', 'k.warehouse': 'مخزن', 'k.supplier': 'مورد', 'k.dealer': 'عميل', 'k.employee': 'موظف',
      'k.shiftReport': 'تقرير وردية', 'k.labTest': 'اختبار معمل', 'k.lot': 'لوط',
      'sort.shiftReport': 'تقرير الوردية', 'sort.quantities': 'الكميات', 'sort.boxes': 'كراتين', 'sort.reserved': 'محجوز', 'sort.dispatched': 'تم شحنه',
      'p.sortingLots': 'الفرز والتعبئة', 'p.sortingLots.sub': 'ناتج الفرز بالفرز ودرجة اللون والمقاس، وما هو متاح منه للحجز.',
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
      'c.date': 'Date', 'c.product': 'Product', 'c.pressedM2': 'Pressed m²', 'c.kilnOutM2': 'Kiln-out m²', 'c.firstPct': 'First-choice %', 'c.downtimeMin': 'Downtime (min)', 'c.gasM3': 'Gas m³',
      'c.test': 'Test', 'c.value': 'Value', 'c.result': 'Result', 'c.ref': 'Reference',
      'c.lot': 'Lot', 'c.grade': 'Grade', 'c.shade': 'Shade', 'c.m2': 'm²', 'c.available': 'Available',
      's.active': 'Active', 's.new': 'New', 's.discontinued': 'Discontinued', 's.running': 'Running', 's.maintenance': 'In maintenance', 's.standby': 'Standby', 's.onLeave': 'On leave', 's.suspended': 'Suspended',
      's.creditHold': 'Credit hold', 's.inactive': 'Inactive', 's.belowMin': 'Below minimum', 's.ok': 'Sufficient', 's.critical': 'Critical', 's.pass': 'Pass', 's.fail': 'Fail',
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
      'p.shiftReports': 'Shift reports', 'p.shiftReports.sub': 'Every shift on every line, with grade output, downtime and gas use.',
      'p.labTests': 'Lab tests', 'p.labTests.sub': 'Incoming, in-process and finished-product tests with their results.',
      'tab.defects': 'Defect codes', 'tab.downtime': 'Downtime reasons', 'tab.tests': 'Quality tests',
      // A2 dashboards
      'exec.sub': 'A morning board: output, grades, sales, collections, and the alerts that need a decision.',
      'exec.kpi.todayM2': 'm² out of kiln today', 'exec.kpi.first7': 'First-choice rate (7d)', 'exec.kpi.sold30': 'm² sold (30d)', 'exec.kpi.revenue30': 'Sales (30d)',
      'exec.kpi.gas7': 'Gas per m² (7d)', 'exec.gasUnit': 'm³/m²', 'exec.kpi.creditHold': 'Dealers on credit hold', 'exec.kpi.openWork': 'Open maintenance orders', 'exec.kpi.openSafety': 'Open safety incidents',
      'exec.trendTitle': 'Kiln-out output — last 45 days', 'exec.regionTitle': 'Sales by region (30d)', 'exec.alertsTitle': 'Alerts that need a decision',
      'exec.alert.creditHold': '{n} dealer(s) on credit hold', 'exec.alert.blockedOrders': 'Orders blocked on credit', 'exec.alert.awaitingPO': '{n} purchase request(s) awaiting approval',
      'exec.alert.openWork': '{n} open maintenance work order(s)', 'exec.alert.openSafety': '{n} open safety incident(s)', 'dash.noAlerts': 'All clear — no alerts right now.', 'common.dash': 'Not enough data yet.',
      'prod.sub': 'Line efficiency, downtime and first-choice rate over the last week.', 'prod.kpi.kilnOut7': 'Kiln-out m² (7d)', 'prod.kpi.first7': 'First-choice rate (7d)',
      'prod.kpi.utilization': 'Capacity utilization', 'prod.kpi.downHours': 'Downtime hours (7d)', 'prod.hoursUnit': 'hours', 'prod.minUnit': 'min',
      'prod.byLineTitle': 'Output by line (7d)', 'prod.downtimeTitle': 'Downtime by reason (30d)', 'prod.trendTitle': 'Daily downtime minutes — last 45 days', 'prod.shiftLogTitle': 'Shift report log',
      'qual.sub': 'Test pass rate, the most frequent defects and open non-conformance reports.', 'qual.kpi.first7': 'First-choice rate (7d)', 'qual.kpi.passRate30': 'Test pass rate (30d)',
      'qual.kpi.openNcr': 'Open non-conformance reports', 'qual.kpi.downgraded30': 'm² downgraded (30d)', 'qual.defectTitle': 'Most frequent defects (30d)', 'qual.passTrendTitle': 'Finished-product pass rate — last 45 days',
      'qual.ncrTitle': 'Open non-conformance reports', 'qual.noNcr': 'No open non-conformance reports.', 'qual.labLogTitle': 'Lab test log',
      // A3 pages
      'c.mill': 'Mill', 'c.recipe': 'Recipe', 'c.week': 'Week starting', 'qc.offSpec': 'Off spec',
      'plan.sub': 'The weekly plan for each line against what was actually run.', 'plan.kpi.adherence': 'Plan adherence (current week)', 'plan.kpi.actual': 'Actual (current week)',
      'plan.kpi.planned': 'Planned (current week)', 'plan.kpi.behind': 'Lines behind plan', 'plan.byLineTitle': 'Plan adherence by line (current week)',
      'plan.tableTitle': 'Weekly plan by line', 'plan.plannedM2': 'Planned m²', 'plan.actualM2': 'Actual m²', 'plan.adherence': 'Adherence', 'plan.upcoming': 'Upcoming',
      'prep.sub': 'Mill runs and the atomizer report against their lab targets.', 'prep.kpi.batches7': 'Mill runs (7d)', 'prep.kpi.tonnesDay': 'Average tonnes/day',
      'prep.tonUnit': 't', 'prep.kpi.moisture': 'Average powder moisture', 'prep.kpi.offSpec': 'Runs off spec', 'prep.millTitle': 'Mill runs (7d)',
      'prep.chargeT': 'Charge (t)', 'prep.atomTitle': 'Atomizer report (7d)', 'prep.throughputT': 'Throughput (t)',
      'glaze.sub': 'Glaze and engobe batches against their lab targets.', 'glaze.kpi.batches7': 'Glaze batches (7d)', 'glaze.kpi.kg7': 'Glaze kg (7d)',
      'glaze.kpi.offSpec': 'Batches off spec', 'glaze.tableTitle': 'Glaze batches (7d)', 'glaze.kg': 'Batch (kg)',
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
      'd.pressed': 'Pressed', 'd.kilnIn': 'Kiln-in', 'd.kilnOut': 'Kiln-out', 'd.first': 'First choice', 'd.commercial': 'Commercial', 'd.second': 'Second choice', 'd.downtimeMin': 'Downtime minutes',
      'd.gas': 'Gas used', 'd.supervisor': 'Shift supervisor', 'd.downtimeEvents': 'Downtime events', 'd.shiftDefects': 'Logged defects', 'd.testStandard': 'Standard', 'd.testSpec': 'Specification',
      'd.testValue': 'Measured value', 'd.testRef': 'Reference', 'd.testBy': 'Tested by',
      'k.product': 'Product', 'k.material': 'Material', 'k.recipe': 'Recipe', 'k.asset': 'Machine', 'k.part': 'Spare part', 'k.warehouse': 'Warehouse', 'k.supplier': 'Supplier', 'k.dealer': 'Customer', 'k.employee': 'Employee',
      'k.shiftReport': 'Shift report', 'k.labTest': 'Lab test', 'k.lot': 'Lot',
      'sort.shiftReport': 'Shift report', 'sort.quantities': 'Quantities', 'sort.boxes': 'Boxes', 'sort.reserved': 'Reserved', 'sort.dispatched': 'Dispatched',
      'p.sortingLots': 'Sorting & packing', 'p.sortingLots.sub': 'Sorting output by grade, shade and caliber, and what is still available to reserve.',
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
  var formatters = {};
  function nf(digits) {
    var key = state.locale + ':' + (digits == null ? 0 : digits);
    return formatters[key] || (formatters[key] = new Intl.NumberFormat(numLocale(), { maximumFractionDigits: digits == null ? 0 : digits }));
  }
  function num(n, digits) { return n == null ? '—' : nf(digits).format(n); }
  function year(n) { return new Intl.NumberFormat(numLocale(), { useGrouping: false }).format(n); }
  function pct() { return state.locale === 'ar' ? '٪' : '%'; }
  function m2() { return state.locale === 'ar' ? 'م²' : 'm²'; }
  function m3() { return state.locale === 'ar' ? 'م³' : 'm³'; }
  function round2(n) { return Math.round(n * 100) / 100; }
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
  [
    'products', 'materials', 'suppliers', 'assets', 'spareParts', 'warehouses', 'dealers', 'employees', 'departments',
    'shiftReports', 'sortingLots', 'salesOrders', 'dispatchLoads', 'purchaseOrders', 'workOrders', 'millBatches', 'atomizerRuns', 'glazeBatches', 'labTests', 'productionPlan',
  ].forEach(function (k) {
    by[k] = {}; DB[k].forEach(function (x) { by[k][x.id] = x; });
  });
  by.recipes = {};
  DB.recipes.body.forEach(function (r) { r.kind = 'body'; by.recipes[r.id] = r; });
  DB.recipes.glaze.forEach(function (r) { r.kind = 'glaze'; by.recipes[r.id] = r; });
  by.defects = {}; DB.codes.defects.forEach(function (d) { by.defects[d.id] = d; });
  by.tests = {}; DB.codes.tests.forEach(function (q) { by.tests[q.id] = q; });
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
    { id: 'exec', group: 'overview', icon: 'chart', name: b('الإدارة العليا', 'Executive'),
      screens: [b('لوحة الصباح: إنتاج وفرز ومبيعات وتحصيل', 'Morning board: output, grades, sales, collections'), b('مقارنة الشهر بالخطة', 'Month against plan'), b('التنبيهات اللي محتاجة قرار', 'Alerts that need a decision'), b('موافقات الخصم وتجاوز الائتمان', 'Discount and credit-limit approvals')],
      kpis: [b('إنتاج م² اليوم والشهر', 'm² today and month to date'), b('نسبة الفرز الأول', 'First-choice rate'), b('المبيعات والتحصيل', 'Sales and collections'), b('غاز م³ لكل م²', 'Gas m³ per m²'), b('أيام تغطية المخزون', 'Days of stock cover')],
      uses: ['products', 'dealers', 'assets'] },
    { id: 'planning', group: 'production', icon: 'calendar', name: b('التخطيط وجدولة الإنتاج', 'Planning & scheduling'),
      screens: [b('خطة شهرية وأسبوعية لكل خط', 'Monthly and weekly plan per line'), b('جدول تغيير المقاسات والتصميمات', 'Size and design changeover schedule'), b('احتياجات الخامات والجليز من الخطة', 'Material and glaze needs from the plan'), b('الخطة مقابل الطلبيات المفتوحة', 'Plan against open orders')],
      kpis: [b('الالتزام بالخطة', 'Plan adherence'), b('عدد مرات التغيير ووقته', 'Changeovers and their time'), b('طلبيات متأخرة', 'Late orders')], uses: ['products', 'recipes'] },
    { id: 'prep', group: 'production', icon: 'mill', name: b('تحضير الخامات', 'Body preparation'),
      screens: [b('تشغيلات الطواحين: الشحنة والمية والمُسيّل والساعات', 'Mill runs: charge, water, deflocculant, hours'), b('تانكات الروبة وقياساتها', 'Slip tanks and readings'), b('تقرير الأتومايزر', 'Atomizer report'), b('أرصدة الصوامع', 'Silo levels')],
      kpis: [b('الكثافة والمتبقي', 'Density and residue'), b('رطوبة البودرة', 'Powder moisture'), b('طن بودرة في اليوم', 'Tonnes of powder a day'), b('الاستهلاك مقابل التركيبة', 'Consumption against recipe')], uses: ['recipes', 'materials', 'assets'] },
    { id: 'glaze', group: 'production', icon: 'drop', name: b('الجليز والتصميمات', 'Glaze & designs'),
      screens: [b('تشغيلات الجليز والإنجوب', 'Glaze and engobe batches'), b('مكتبة التصميمات بإصداراتها ووجوهها', 'Design library with versions and faces'), b('أرصدة الأحبار لكل لون', 'Ink stock by colour'), b('أوزان الطبقات لكل منتج', 'Layer weights per product')],
      kpis: [b('جم حبر لكل م²', 'Ink g/m²'), b('كجم جليز لكل م²', 'Glaze kg/m²'), b('مبيعات كل تصميم', 'Sales by design')], uses: ['recipes', 'products', 'materials'] },
    { id: 'lines', group: 'production', icon: 'factory', name: b('خطوط الإنتاج', 'Production lines'),
      screens: [b('تقرير الوردية لكل خط', 'Shift report per line'), b('قراءات المكبس والفرن', 'Press and kiln readings'), b('التوقفات بأسبابها', 'Downtime with reasons'), b('الكسر في كل مرحلة', 'Breakage at each stage'), b('شاشة تابلت للعامل', 'Operator tablet screen')],
      kpis: [b('كفاءة المعدات الكلية', 'Overall equipment effectiveness'), b('ساعات التوقف', 'Downtime hours'), b('م² في الساعة', 'm² per hour'), b('كسر أخضر ومحروق', 'Green and fired breakage')], uses: ['assets', 'codes', 'products', 'employees'] },
    { id: 'sorting', group: 'production', icon: 'layers', name: b('الفرز والتعبئة', 'Sorting & packing'),
      screens: [b('ناتج الفرز بالفرز ودرجة اللون والمقاس', 'Sorting output by grade, shade and caliber'), b('إنشاء لوط وملصق باليتة بباركود', 'Lot creation and barcoded pallet label'), b('التحويل للمخزن التام', 'Transfer to finished goods'), b('إعادة الفرز', 'Re-sorting')],
      kpis: [b('توزيع الفروز', 'Grade mix'), b('درجات اللون في اللوط', 'Shades per lot'), b('باليتات في الوردية', 'Pallets per shift')], uses: ['products', 'codes'] },
    { id: 'quality', group: 'quality', icon: 'flask', name: b('الجودة والمعمل', 'Quality & lab'),
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
        { key: 'family', label: 'c.family', sort: function (p) { return L(DB.families[p.family].name); }, cell: function (p) { return esc(L(DB.families[p.family].name)); } },
        { key: 'line', label: 'c.line', sort: function (p) { return p.line; }, cell: function (p) { return esc(p.line); } },
        { key: 'g1', label: 'c.g1', end: true, sort: function (p) { return price(p, 'G1'); }, cell: function (p) { return '<span class="num">' + num(price(p, 'G1')) + '</span>'; } },
        { key: 'g2', label: 'c.g2', end: true, sort: function (p) { return price(p, 'G2'); }, cell: function (p) { return '<span class="num">' + num(price(p, 'G2')) + '</span>'; } },
        { key: 'cost', label: 'c.cost', end: true, sort: function (p) { return p.stdCostPerM2; }, cell: function (p) { return '<span class="num">' + num(p.stdCostPerM2) + '</span>'; } },
        { key: 'status', label: 'c.status', sort: function (p) { return t('s.' + p.status); }, cell: function (p) { return statusChip(p.status); } },
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
        { key: 'category', label: 'c.category', sort: function (m) { return L(DB.materialCategories[m.category]); }, cell: function (m) { return esc(L(DB.materialCategories[m.category])); } },
        { key: 'origin', label: 'c.origin', sort: function (m) { return L(DB.origins[m.origin]); }, cell: function (m) { return m.imported ? chip(L(DB.origins[m.origin]), 'accent') : chip(L(DB.origins[m.origin]), '', true); } },
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
        { key: 'kind', label: 'c.type', sort: function (r) { return t(r.kind); }, cell: function (r) { return chip(t(r.kind), r.kind === 'body' ? 'glaze' : 'accent', true); } },
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
        { key: 'area', label: 'c.area', sort: function (a) { return L(DB.areas[a.area]); }, cell: function (a) { return esc(L(DB.areas[a.area])); } },
        { key: 'maker', label: 'c.maker', sort: function (a) { return a.maker; }, cell: function (a) { return '<div class="cell-main"><span>' + esc(a.maker) + '</span><small dir="ltr">' + esc(a.model) + '</small></div>'; } },
        { key: 'year', label: 'c.year', end: true, sort: function (a) { return a.year; }, cell: function (a) { return '<span class="num">' + year(a.year) + '</span>'; } },
        { key: 'crit', label: 'c.crit', sort: function (a) { return a.criticality; }, cell: function (a) { return chip(a.criticality, a.criticality === 'A' ? 'bad' : a.criticality === 'B' ? 'warn' : '', true); } },
        { key: 'pm', label: 'c.pm', sort: function (a) { return t('pm.' + a.pmBasis, { n: '' }); }, cell: function (a) { return '<span class="small">' + esc(t('pm.' + a.pmBasis, { n: num(a.pmInterval) })) + '</span>'; } },
        { key: 'status', label: 'c.status', sort: function (a) { return t('s.' + a.status); }, cell: function (a) { return statusChip(a.status); } },
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
        { key: 'for', label: 'c.for', sort: function (p) { return p.assetType === '*' ? t('anyEquipment') : L(DB.assetTypes[p.assetType]); }, cell: function (p) { return '<span class="small">' + esc(p.assetType === '*' ? t('anyEquipment') : L(DB.assetTypes[p.assetType])) + '</span>'; } },
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
        { key: 'site', label: 'c.site', sort: function (w) { return L(DB.sites.filter(function (s) { return s.id === w.site; })[0].name); }, cell: function (w) { return esc(L(DB.sites.filter(function (s) { return s.id === w.site; })[0].name)); } },
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
        { key: 'category', label: 'c.category', sort: function (s) { return L(DB.supplierCategories[s.category]); }, cell: function (s) { return esc(L(DB.supplierCategories[s.category])); } },
        { key: 'country', label: 'c.country', sort: function (s) { return L(DB.origins[s.country]); }, cell: function (s) { return esc(L(DB.origins[s.country])); } },
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
        { key: 'status', label: 'c.status', sort: function (d) { return t('s.' + d.status); }, cell: function (d) { return statusChip(d.status); } },
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
        { key: 'dept', label: 'c.dept', sort: function (e) { return L(by.departments[e.departmentId].name); }, cell: function (e) { return esc(L(by.departments[e.departmentId].name)); } },
        { key: 'title', label: 'c.title', sort: function (e) { return L(e.title); }, cell: function (e) { return '<span class="small">' + esc(L(e.title)) + '</span>'; } },
        { key: 'shift', label: 'c.shift', sort: function (e) { return e.shift; }, cell: function (e) { return esc(L(DB.company.shifts.filter(function (s) { return s.id === e.shift; })[0].name)) + (e.line ? ' <span class="muted small">· ' + e.line + '</span>' : ''); } },
        { key: 'hired', label: 'c.hired', end: true, sort: function (e) { return e.hireDate; }, cell: function (e) { return '<span class="num small">' + esc(date(e.hireDate)) + '</span>'; } },
        { key: 'status', label: 'c.status', sort: function (e) { return t('s.' + e.status); }, cell: function (e) { return statusChip(e.status); } },
      ],
    },
    shiftReports: {
      kind: 'shiftReport', rows: function () { return DB.shiftReports; },
      search: function (s) { return s.id + ' ' + s.line + ' ' + s.date + ' ' + s.shift + ' ' + L(by.products[s.productId].name); },
      filters: [
        { key: 'line', label: 'c.line', options: function () { return DB.lines.map(function (l) { return [l.id, L(l.name)]; }); }, test: function (s, v) { return s.line === v; } },
        { key: 'shift', label: 'c.shift', options: function () { return DB.company.shifts.map(function (sh) { return [sh.id, L(sh.name)]; }); }, test: function (s, v) { return s.shift === v; } },
      ],
      columns: [
        { key: 'date', label: 'c.date', sort: function (s) { return s.date; }, cell: function (s) { return '<span class="num small">' + esc(date(s.date)) + '</span>'; } },
        { key: 'line', label: 'c.line', sort: function (s) { return L(LINE[s.line].name); }, cell: function (s) { return esc(L(LINE[s.line].name)); } },
        { key: 'shift', label: 'c.shift', sort: function (s) { return s.shift; }, cell: function (s) { return esc(L(DB.company.shifts.filter(function (sh) { return sh.id === s.shift; })[0].name)); } },
        { key: 'product', label: 'c.product', sort: function (s) { return L(by.products[s.productId].name); }, cell: function (s) { return esc(L(by.products[s.productId].name)); } },
        { key: 'pressed', label: 'c.pressedM2', end: true, sort: function (s) { return s.pressedM2; }, cell: function (s) { return '<span class="num">' + num(s.pressedM2) + '</span>'; } },
        { key: 'kilnOut', label: 'c.kilnOutM2', end: true, sort: function (s) { return s.kilnOutM2; }, cell: function (s) { return '<span class="num">' + num(s.kilnOutM2) + '</span>'; } },
        { key: 'firstPct', label: 'c.firstPct', end: true, sort: function (s) { return s.kilnOutM2 ? s.firstM2 / s.kilnOutM2 : 0; }, cell: function (s) { return '<span class="num">' + (s.kilnOutM2 ? num(Math.round(s.firstM2 / s.kilnOutM2 * 100)) : '—') + pct() + '</span>'; } },
        { key: 'down', label: 'c.downtimeMin', end: true, sort: function (s) { return s.downtimeMinutes; }, cell: function (s) { return '<span class="num">' + num(s.downtimeMinutes) + '</span>'; } },
        { key: 'gas', label: 'c.gasM3', end: true, sort: function (s) { return s.gasM3; }, cell: function (s) { return '<span class="num">' + num(s.gasM3) + '</span>'; } },
      ],
    },
    labTests: {
      kind: 'labTest', rows: function () { return DB.labTests; },
      search: function (q) { return q.id + ' ' + L(by.tests[q.testCodeId].name) + ' ' + q.stage; },
      filters: [
        { key: 'stage', label: 'c.stage', options: function () { return ['incoming', 'process', 'finished'].map(function (k) { return [k, L(DB.codes.testStages[k])]; }); }, test: function (q, v) { return q.stage === v; } },
        { key: 'result', label: 'c.result', options: function () { return [['pass', t('s.pass')], ['fail', t('s.fail')]]; }, test: function (q, v) { return (v === 'pass') === q.pass; } },
      ],
      columns: [
        { key: 'date', label: 'c.date', sort: function (q) { return q.date; }, cell: function (q) { return '<span class="num small">' + esc(date(q.date)) + '</span>'; } },
        { key: 'test', label: 'c.test', sort: function (q) { return L(by.tests[q.testCodeId].name); }, cell: function (q) { return esc(L(by.tests[q.testCodeId].name)); } },
        { key: 'stage', label: 'c.stage', sort: function (q) { return L(DB.codes.testStages[q.stage]); }, cell: function (q) { return esc(L(DB.codes.testStages[q.stage])); } },
        { key: 'value', label: 'c.value', end: true, sort: function (q) { return q.value; }, cell: function (q) { return '<span class="num">' + num(q.value, 2) + '</span>'; } },
        { key: 'result', label: 'c.result', sort: function (q) { return q.pass ? 0 : 1; }, cell: function (q) { return q.pass ? chip(t('s.pass'), 'pos') : chip(t('s.fail'), 'bad'); } },
      ],
    },
    sortingLots: {
      kind: 'lot', rows: function () { return DB.sortingLots; },
      search: function (l) { return l.lotNumber + ' ' + l.line + ' ' + l.shade + ' ' + L(by.products[l.productId].name); },
      filters: [
        { key: 'line', label: 'c.line', options: function () { return DB.lines.map(function (l) { return [l.id, L(l.name)]; }); }, test: function (l, v) { return l.line === v; } },
        { key: 'grade', label: 'c.grade', options: function () { return DB.grades.map(function (g) { return [g.id, L(g.name)]; }); }, test: function (l, v) { return l.grade === v; } },
      ],
      columns: [
        { key: 'lotNumber', label: 'c.lot', sort: function (l) { return l.lotNumber; }, cell: function (l) { return '<span class="mono">' + esc(l.lotNumber) + '</span>'; } },
        { key: 'date', label: 'c.date', sort: function (l) { return l.date; }, cell: function (l) { return '<span class="num small">' + esc(date(l.date)) + '</span>'; } },
        { key: 'line', label: 'c.line', sort: function (l) { return L(LINE[l.line].name); }, cell: function (l) { return esc(L(LINE[l.line].name)); } },
        { key: 'product', label: 'c.product', sort: function (l) { return L(by.products[l.productId].name); }, cell: function (l) { return esc(L(by.products[l.productId].name)); } },
        { key: 'grade', label: 'c.grade', sort: function (l) { return l.grade; }, cell: function (l) { return chip(l.grade, l.grade === 'G1' ? 'pos' : l.grade === 'G2' ? 'warn' : 'bad', true); } },
        { key: 'shade', label: 'c.shade', sort: function (l) { return l.shade; }, cell: function (l) { return '<span class="mono">' + esc(l.shade) + '</span>'; } },
        { key: 'm2', label: 'c.m2', end: true, sort: function (l) { return l.m2; }, cell: function (l) { return '<span class="num">' + num(l.m2) + '</span>'; } },
        { key: 'available', label: 'c.available', end: true, sort: function (l) { return l.m2 - l.reservedM2 - l.dispatchedM2; }, cell: function (l) { return '<span class="num">' + num(l.m2 - l.reservedM2 - l.dispatchedM2) + '</span>'; } },
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
  function renderListPage(id, embed) {
    var def = LISTS[id], st = listState(id);
    var filters = def.filters.map(function (f) {
      return '<select data-filter="' + f.key + '" data-list="' + id + '" aria-label="' + esc(t(f.label)) + '"><option value="">' + esc(t(f.label)) + ': ' + esc(t('all')) + '</option>' +
        f.options().map(function (o) { return '<option value="' + esc(o[0]) + '"' + (st.f[f.key] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    }).join('');
    var head = embed ? '' : pageHead(t('p.' + id), t('p.' + id + '.sub'), 'g.master');
    return head +
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
  function refocus(selector, preferLast) {
    var found = document.querySelectorAll('#listBody ' + selector);
    var target = found.length ? found[preferLast ? found.length - 1 : 0] : null;
    if (target) target.focus();
  }
  function refreshListBody(id) { var el = document.getElementById('listBody'); if (el) el.innerHTML = renderListBody(id); }

  // ================================================================ pages
  function pageHead(title, sub, groupKey, extra) {
    return '<header class="page-head"><div class="titles"><span class="eyebrow">' + esc(t(groupKey)) + '</span><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + (extra || '') + '</header>';
  }

  // ---- dashboard building blocks: one trend line, one ranked-bar list, one KPI row, one alert list ----
  function dateRange(fromIso, toIso) {
    var out = [], d = Date.parse(fromIso + 'T00:00:00Z'), end = Date.parse(toIso + 'T00:00:00Z');
    while (d <= end) { out.push(new Date(d).toISOString().slice(0, 10)); d += 864e5; }
    return out;
  }
  var WINDOW = dateRange(DB.windowStart, DB.referenceDate);
  function sumField(arr, field) { return arr.reduce(function (s, x) { return s + (x[field] || 0); }, 0); }
  function statTiles(items) {
    return '<div class="stats">' + items.map(function (it) { return '<div class="stat"><span class="v">' + it.value + '</span><span class="l">' + esc(it.label) + '</span></div>'; }).join('') + '</div>';
  }
  /** A single-hue trend line with an area fill and a hover title per point (DESIGN reference: one axis, one series, no dual scales). */
  function trendChart(points, opts) {
    opts = opts || {};
    if (!points.length) return '<p class="muted small">' + esc(t('common.dash')) + '</p>';
    var w = opts.width || 600, h = opts.height || 140, pad = 20, n = points.length;
    var values = points.map(function (p) { return p.value; });
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (min === max) { var pad2 = Math.max(1, Math.abs(min) * 0.1); min -= pad2; max += pad2; }
    var range = max - min;
    function x(i) { return n <= 1 ? w / 2 : pad + (i * (w - pad * 2) / (n - 1)); }
    function y(v) { return h - pad - ((v - min) / range) * (h - pad * 2); }
    var color = opts.color || 'var(--accent)';
    var fmt = opts.format || function (v) { return num(v); };
    var coords = points.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p.value).toFixed(1); });
    var area = 'M' + x(0).toFixed(1) + ',' + (h - pad) + ' L' + coords.join(' L ') + ' L' + x(n - 1).toFixed(1) + ',' + (h - pad) + ' Z';
    var dots = points.map(function (p, i) {
      return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="2.4" fill="' + color + '"><title>' + esc(date(p.date)) + ': ' + esc(fmt(p.value)) + '</title></circle>';
    }).join('');
    return '<div class="trend"><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.label || '') + '">' +
      '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" stroke="var(--border)" stroke-width="1"/>' +
      '<path d="' + area + '" fill="' + color + '" opacity="0.14" stroke="none"/>' +
      '<polyline points="' + coords.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2"/>' + dots + '</svg>' +
      '<div class="trend-foot"><span class="muted small">' + esc(date(points[0].date)) + '</span><span class="muted small">' + esc(date(points[n - 1].date)) + '</span></div></div>';
  }
  /** Magnitude across categories: one hue, sorted by the caller, direct value labels (dataviz: ranked bars, not a rainbow). */
  function rankBars(rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<p class="muted small">' + esc(t('common.dash')) + '</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    var fmt = opts.format || num;
    return '<div class="bars">' + rows.map(function (r) {
      var style = 'width:' + (r.value / max * 100).toFixed(1) + '%' + (r.tone ? ';background:var(--' + r.tone + ')' : '');
      return '<div class="bar-row"><span>' + esc(r.label) + '</span><div class="bar-track"><div class="bar-fill" style="' + style + '"></div></div><span class="num" style="text-align:end">' + esc(fmt(r.value)) + '</span></div>';
    }).join('') + '</div>';
  }
  /** Status is never color alone: each row carries a dot plus its own label text, and is a real button to the page that explains it. */
  function alertList(items) {
    if (!items.length) return '<p class="muted small">' + esc(t('dash.noAlerts')) + '</p>';
    return '<ul class="linklist">' + items.map(function (a) {
      return '<li><button class="link alert-row" data-action="nav" data-id="' + a.target + '"><span class="dot ' + a.tone + '"></span>' + esc(a.text) + '</button></li>';
    }).join('') + '</ul>';
  }
  function orderRevenue(o) {
    var dealer = by.dealers[o.dealerId];
    var pl = DB.priceLists.filter(function (p) { return p.id === dealer.priceList; })[0];
    return o.lines.reduce(function (sum, l) {
      var product = by.products[l.productId];
      return sum + Math.round(price(product, l.grade) * pl.factor / 5) * 5 * l.m2;
    }, 0);
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
      var now = DONE_PHASES.indexOf(p) >= 0;
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

  // ================================================================ A2 dashboards
  function renderExecDashboard() {
    var last7 = new Set(WINDOW.slice(-7)), last30 = new Set(WINDOW.slice(-30));
    var todayReports = DB.shiftReports.filter(function (s) { return s.date === DB.referenceDate; });
    var last7Reports = DB.shiftReports.filter(function (s) { return last7.has(s.date); });
    var todayM2 = sumField(todayReports, 'kilnOutM2');
    var first7 = sumField(last7Reports, 'firstM2'), kiln7 = sumField(last7Reports, 'kilnOutM2'), gas7 = sumField(last7Reports, 'gasM3');
    var salesLast30 = DB.salesOrders.filter(function (o) { return last30.has(o.date); });
    var m2Sold30 = sumField(salesLast30, 'totalM2');
    var revenue30 = salesLast30.reduce(function (sum, o) { return sum + orderRevenue(o); }, 0);
    var creditHold = DB.dealers.filter(function (d) { return d.status === 'creditHold'; });
    var openSafety = DB.safetyIncidents.filter(function (x) { return !x.closed; });
    var openWork = DB.workOrders.filter(function (w) { return w.status === 'open'; });
    var awaitingPO = DB.purchaseOrders.filter(function (p) { return p.status === 'requested'; });
    var blockedOrders = DB.salesOrders.filter(function (o) { return o.blockedOnCredit; });

    var stats = statTiles([
      { value: num(todayM2), label: t('exec.kpi.todayM2') },
      { value: (kiln7 ? num(Math.round(first7 / kiln7 * 100)) : '—') + pct(), label: t('exec.kpi.first7') },
      { value: num(m2Sold30), label: t('exec.kpi.sold30') },
      { value: money(revenue30), label: t('exec.kpi.revenue30') },
      { value: (kiln7 ? num(round2(gas7 / kiln7)) : '—') + ' ' + t('exec.gasUnit'), label: t('exec.kpi.gas7') },
      { value: num(creditHold.length), label: t('exec.kpi.creditHold') },
      { value: num(openWork.length), label: t('exec.kpi.openWork') },
      { value: num(openSafety.length), label: t('exec.kpi.openSafety') },
    ]);

    var dailyTrend = WINDOW.map(function (date) { return { date: date, value: sumField(DB.shiftReports.filter(function (s) { return s.date === date; }), 'kilnOutM2') }; });

    var regionSums = {};
    salesLast30.forEach(function (o) { var d = by.dealers[o.dealerId]; regionSums[d.region] = (regionSums[d.region] || 0) + o.totalM2; });
    var regionRows = Object.keys(regionSums).sort(function (a, b) { return regionSums[b] - regionSums[a]; }).slice(0, 7)
      .map(function (k) { return { label: L(DB.regions[k]), value: regionSums[k] }; });

    var alerts = [];
    if (creditHold.length) alerts.push({ tone: 'bad', text: t('exec.alert.creditHold', { n: num(creditHold.length) }), target: 'dealers' });
    if (blockedOrders.length) alerts.push({ tone: 'warn', text: t('exec.alert.blockedOrders', { n: num(blockedOrders.length) }), target: 'sales' });
    if (awaitingPO.length) alerts.push({ tone: 'warn', text: t('exec.alert.awaitingPO', { n: num(awaitingPO.length) }), target: 'purchasing' });
    if (openWork.length) alerts.push({ tone: 'warn', text: t('exec.alert.openWork', { n: num(openWork.length) }), target: 'maintenance' });
    if (openSafety.length) alerts.push({ tone: 'bad', text: t('exec.alert.openSafety', { n: num(openSafety.length) }), target: 'safety' });

    return pageHead(L(MODULE_BY_ID.exec.name), t('exec.sub'), 'g.overview') + stats +
      '<div class="grid-2">' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('exec.trendTitle')) + '</h2></div>' + trendChart(dailyTrend, { color: 'var(--glaze)', format: function (v) { return num(v) + ' ' + m2(); }, label: t('exec.trendTitle') }) + '</section>' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('exec.regionTitle')) + '</h2></div>' + rankBars(regionRows, { format: function (v) { return num(v) + ' ' + m2(); } }) + '</section>' +
      '</div>' +
      '<section class="card"><div class="section-title"><h2>' + esc(t('exec.alertsTitle')) + '</h2></div>' + alertList(alerts) + '</section>';
  }

  function renderProductionDashboard() {
    var last7 = new Set(WINDOW.slice(-7)), last30 = new Set(WINDOW.slice(-30));
    var last7Reports = DB.shiftReports.filter(function (s) { return last7.has(s.date); });
    var last30Reports = DB.shiftReports.filter(function (s) { return last30.has(s.date); });
    var pressed7 = sumField(last7Reports, 'pressedM2'), kiln7 = sumField(last7Reports, 'kilnOutM2'), first7 = sumField(last7Reports, 'firstM2');
    var down7 = sumField(last7Reports, 'downtimeMinutes');
    var theoretical7 = DB.lines.reduce(function (s, l) { return s + l.capacityM2Day; }, 0) / 3 * last7Reports.length / DB.lines.length;
    var utilPct = theoretical7 ? Math.round(pressed7 / theoretical7 * 100) : 0;

    var stats = statTiles([
      { value: num(kiln7), label: t('prod.kpi.kilnOut7') },
      { value: (kiln7 ? num(Math.round(first7 / kiln7 * 100)) : '—') + pct(), label: t('prod.kpi.first7') },
      { value: num(utilPct) + pct(), label: t('prod.kpi.utilization') },
      { value: num(round2(down7 / 60)) + ' ' + t('prod.hoursUnit'), label: t('prod.kpi.downHours') },
    ]);

    var byLine = DB.lines.map(function (l) {
      var rows = last7Reports.filter(function (s) { return s.line === l.id; });
      return { label: L(l.name), value: sumField(rows, 'kilnOutM2') };
    });

    var downtimeByCat = {};
    DB.downtimeEvents.filter(function (e) { return last30.has(e.date); }).forEach(function (e) {
      var cat = DB.codes.downtime.filter(function (c) { return c.id === e.codeId; })[0].category;
      downtimeByCat[cat] = (downtimeByCat[cat] || 0) + e.minutes;
    });
    var downtimeRows = Object.keys(downtimeByCat).sort(function (a, b) { return downtimeByCat[b] - downtimeByCat[a]; })
      .map(function (k) { return { label: L(DB.codes.downtimeCategories[k]), value: downtimeByCat[k] }; });

    var dailyTrend = WINDOW.map(function (date) { return { date: date, value: sumField(DB.shiftReports.filter(function (s) { return s.date === date; }), 'downtimeMinutes') }; });

    return pageHead(L(MODULE_BY_ID.lines.name), t('prod.sub'), 'g.production') + stats +
      '<div class="grid-2">' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('prod.byLineTitle')) + '</h2></div>' + rankBars(byLine, { format: function (v) { return num(v) + ' ' + m2(); } }) + '</section>' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('prod.downtimeTitle')) + '</h2></div>' + rankBars(downtimeRows, { format: function (v) { return num(v) + ' ' + t('prod.minUnit'); } }) + '</section>' +
      '</div>' +
      '<section class="card"><div class="section-title"><h2>' + esc(t('prod.trendTitle')) + '</h2></div>' + trendChart(dailyTrend, { color: 'var(--warn)', format: function (v) { return num(v) + ' ' + t('prod.minUnit'); }, label: t('prod.trendTitle') }) + '</section>' +
      '<div class="row spread"><h2 style="margin:0">' + esc(t('prod.shiftLogTitle')) + '</h2></div>' + renderListPage('shiftReports', true);
  }

  function renderQualityDashboard() {
    var last7 = new Set(WINDOW.slice(-7)), last30 = new Set(WINDOW.slice(-30));
    var finished30 = DB.labTests.filter(function (t2) { return t2.stage === 'finished' && last30.has(t2.date); });
    var passRate = finished30.length ? Math.round(finished30.filter(function (t2) { return t2.pass; }).length / finished30.length * 100) : 0;
    var last7Reports = DB.shiftReports.filter(function (s) { return last7.has(s.date); });
    var first7 = sumField(last7Reports, 'firstM2'), kiln7 = sumField(last7Reports, 'kilnOutM2');
    var openReports = finished30.filter(function (t2) { return !t2.pass; });

    var stats = statTiles([
      { value: (kiln7 ? num(Math.round(first7 / kiln7 * 100)) : '—') + pct(), label: t('qual.kpi.first7') },
      { value: num(passRate) + pct(), label: t('qual.kpi.passRate30') },
      { value: num(openReports.length), label: t('qual.kpi.openNcr') },
      { value: num(DB.defectOccurrences.filter(function (d) { return last30.has(d.date); }).reduce(function (s, d) { return s + d.m2; }, 0)), label: t('qual.kpi.downgraded30') },
    ]);

    var defectSums = {};
    DB.defectOccurrences.filter(function (d) { return last30.has(d.date); }).forEach(function (d) { defectSums[d.defectCodeId] = (defectSums[d.defectCodeId] || 0) + d.m2; });
    var defectRows = Object.keys(defectSums).sort(function (a, b) { return defectSums[b] - defectSums[a]; }).slice(0, 8)
      .map(function (k) { return { label: L(by.defects[k].name), value: defectSums[k] }; });

    var passTrend = WINDOW.map(function (date) {
      var day = DB.labTests.filter(function (t2) { return t2.stage === 'finished' && t2.date === date; });
      return { date: date, value: day.length ? Math.round(day.filter(function (t2) { return t2.pass; }).length / day.length * 100) : null };
    }).filter(function (p) { return p.value !== null; });

    var ncrRows = openReports.slice(0, 8).map(function (t2) {
      var lot = by.sortingLots[t2.refId];
      return '<li><button class="link" data-action="open" data-kind="labTest" data-id="' + t2.id + '"><span class="dot bad"></span>' +
        esc(L(by.tests[t2.testCodeId].name)) + (lot ? ' — ' + esc(lot.lotNumber) : '') + ' · ' + esc(date(t2.date)) + '</button></li>';
    }).join('');

    return pageHead(L(MODULE_BY_ID.quality.name), t('qual.sub'), 'g.quality') + stats +
      '<div class="grid-2">' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('qual.defectTitle')) + '</h2></div>' + rankBars(defectRows, { tone: 'bad', format: function (v) { return num(v) + ' ' + m2(); } }) + '</section>' +
        '<section class="card"><div class="section-title"><h2>' + esc(t('qual.passTrendTitle')) + '</h2></div>' + trendChart(passTrend, { color: 'var(--pos)', format: function (v) { return num(v) + pct(); }, label: t('qual.passTrendTitle') }) + '</section>' +
      '</div>' +
      '<section class="card"><div class="section-title"><h2>' + esc(t('qual.ncrTitle')) + '</h2></div>' + (ncrRows ? '<ul class="linklist">' + ncrRows + '</ul>' : '<p class="muted small">' + esc(t('qual.noNcr')) + '</p>') + '</section>' +
      '<div class="row spread"><h2 style="margin:0">' + esc(t('qual.labLogTitle')) + '</h2></div>' + renderListPage('labTests', true);
  }

  // ================================================================ A3 pages
  function renderPlanningPage() {
    var weekKeys = {}; DB.productionPlan.forEach(function (p) { weekKeys[p.weekStart] = true; });
    var pastWeeks = Object.keys(weekKeys).filter(function (w) { return w <= DB.referenceDate; }).sort();
    var currentWeekStart = pastWeeks[pastWeeks.length - 1];
    var currentWeekRows = DB.productionPlan.filter(function (p) { return p.weekStart === currentWeekStart; });
    var totalPlanned = sumField(currentWeekRows, 'plannedM2'), totalActual = sumField(currentWeekRows, 'actualM2');
    var adherence = totalPlanned ? Math.round(totalActual / totalPlanned * 100) : 0;
    var behindLines = currentWeekRows.filter(function (p) { return p.plannedM2 && p.actualM2 / p.plannedM2 < 0.9; });

    var stats = statTiles([
      { value: num(adherence) + pct(), label: t('plan.kpi.adherence') },
      { value: num(totalActual) + ' ' + m2(), label: t('plan.kpi.actual') },
      { value: num(totalPlanned) + ' ' + m2(), label: t('plan.kpi.planned') },
      { value: num(behindLines.length), label: t('plan.kpi.behind') },
    ]);

    var byLineAdherence = DB.lines.map(function (l) {
      var row = currentWeekRows.filter(function (p) { return p.line === l.id; })[0];
      return { label: L(l.name), value: row && row.plannedM2 ? Math.round(row.actualM2 / row.plannedM2 * 100) : 0 };
    });

    var rows = DB.productionPlan.slice().sort(function (a, b) { return cmp(b.weekStart, a.weekStart) || cmp(a.line, b.line); });
    var tableRows = rows.map(function (p) {
      var future = p.weekStart > DB.referenceDate;
      var pctVal = p.plannedM2 ? Math.round(p.actualM2 / p.plannedM2 * 100) : 0;
      var tone = pctVal >= 95 ? 'pos' : pctVal >= 85 ? 'warn' : 'bad';
      return '<tr><td class="num small">' + esc(date(p.weekStart)) + '</td><td>' + esc(L(LINE[p.line].name)) + '</td><td>' + esc(L(by.products[p.productId].name)) + '</td>' +
        '<td class="end num">' + num(p.plannedM2) + '</td><td class="end num">' + (future ? '—' : num(p.actualM2)) + '</td>' +
        '<td class="end">' + (future ? chip(t('plan.upcoming'), '', true) : chip(num(pctVal) + pct(), tone, true)) + '</td></tr>';
    }).join('');
    var table = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('c.week')) + '</th><th>' + esc(t('c.line')) + '</th><th>' + esc(t('c.product')) + '</th>' +
      '<th class="end">' + esc(t('plan.plannedM2')) + '</th><th class="end">' + esc(t('plan.actualM2')) + '</th><th class="end">' + esc(t('plan.adherence')) + '</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>';

    return pageHead(L(MODULE_BY_ID.planning.name), t('plan.sub'), 'g.production') + stats +
      '<section class="card"><div class="section-title"><h2>' + esc(t('plan.byLineTitle')) + '</h2></div>' + rankBars(byLineAdherence, { format: function (v) { return num(v) + pct(); } }) + '</section>' +
      '<section class="card"><div class="section-title"><h2>' + esc(t('plan.tableTitle')) + '</h2></div>' + table + '</section>';
  }

  function renderPrepPage() {
    var last7 = new Set(WINDOW.slice(-7));
    var recent = DB.millBatches.filter(function (b) { return last7.has(b.date); }).sort(function (a, b) { return cmp(b.date, a.date); });
    var atomRecent = DB.atomizerRuns.filter(function (a) { return last7.has(a.date); });
    var tonnesDay = recent.length ? round2(sumField(recent, 'chargeTons') / 7) : 0;
    var avgMoisture = atomRecent.length ? round2(sumField(atomRecent, 'powderMoisture') / atomRecent.length) : 0;
    var offSpec = recent.filter(function (b) {
      var tg = by.recipes[b.recipeId].targets;
      return b.slipDensity < tg.slipDensity[0] || b.slipDensity > tg.slipDensity[1] || b.residue63 < tg.residue63[0] || b.residue63 > tg.residue63[1];
    });

    var stats = statTiles([
      { value: num(recent.length), label: t('prep.kpi.batches7') },
      { value: num(tonnesDay, 1) + ' ' + t('prep.tonUnit'), label: t('prep.kpi.tonnesDay') },
      { value: num(avgMoisture, 1) + pct(), label: t('prep.kpi.moisture') },
      { value: num(offSpec.length), label: t('prep.kpi.offSpec') },
    ]);

    var millRows = recent.slice(0, 30).map(function (b) {
      var recipe = by.recipes[b.recipeId], tg = recipe.targets;
      var ok = b.slipDensity >= tg.slipDensity[0] && b.slipDensity <= tg.slipDensity[1] && b.residue63 >= tg.residue63[0] && b.residue63 <= tg.residue63[1];
      return '<tr><td class="num small">' + esc(date(b.date)) + '</td><td>' + openLink('asset', b.millAssetId, by.assets[b.millAssetId].code) + '</td>' +
        '<td>' + openLink('recipe', b.recipeId, L(recipe.name) + ' v' + recipe.version) + '</td>' +
        '<td class="end num">' + num(b.chargeTons) + '</td><td class="end num">' + num(b.slipDensity) + '</td><td class="end num">' + num(b.residue63, 1) + '</td>' +
        '<td>' + (ok ? chip(t('s.ok'), 'pos', true) : chip(t('qc.offSpec'), 'bad', true)) + '</td></tr>';
    }).join('');
    var millTable = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('c.date')) + '</th><th>' + esc(t('c.mill')) + '</th><th>' + esc(t('c.recipe')) + '</th>' +
      '<th class="end">' + esc(t('prep.chargeT')) + '</th><th class="end">' + esc(t('d.slipDensity')) + '</th><th class="end">' + esc(t('d.residue')) + '</th><th>' + esc(t('c.status')) + '</th></tr></thead><tbody>' + millRows + '</tbody></table></div>';

    var atomRows = atomRecent.slice().sort(function (a, b) { return cmp(b.date, a.date); }).map(function (a) {
      return '<tr><td class="num small">' + esc(date(a.date)) + '</td><td class="end num">' + num(a.powderMoisture, 1) + '</td><td class="end num">' + num(a.throughputTons) + '</td></tr>';
    }).join('');
    var atomTable = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('c.date')) + '</th><th class="end">' + esc(t('d.powderMoisture')) + '</th><th class="end">' + esc(t('prep.throughputT')) + '</th></tr></thead><tbody>' + atomRows + '</tbody></table></div>';

    return pageHead(L(MODULE_BY_ID.prep.name), t('prep.sub'), 'g.production') + stats +
      '<section class="card"><div class="section-title"><h2>' + esc(t('prep.millTitle')) + '</h2></div>' + millTable + '</section>' +
      '<section class="card"><div class="section-title"><h2>' + esc(t('prep.atomTitle')) + '</h2></div>' + atomTable + '</section>';
  }

  function renderGlazePage() {
    var last7 = new Set(WINDOW.slice(-7));
    var recent = DB.glazeBatches.filter(function (b) { return last7.has(b.date); }).sort(function (a, b) { return cmp(b.date, a.date); });
    var offSpec = recent.filter(function (b) {
      var tg = by.recipes[b.recipeId].targets;
      return b.density < tg.density[0] || b.density > tg.density[1] || b.viscositySec < tg.viscositySec[0] || b.viscositySec > tg.viscositySec[1];
    });
    var totalKg7 = sumField(recent, 'batchKg');

    var stats = statTiles([
      { value: num(recent.length), label: t('glaze.kpi.batches7') },
      { value: num(totalKg7), label: t('glaze.kpi.kg7') },
      { value: num(offSpec.length), label: t('glaze.kpi.offSpec') },
    ]);

    var rows = recent.slice(0, 30).map(function (b) {
      var recipe = by.recipes[b.recipeId], tg = recipe.targets;
      var ok = b.density >= tg.density[0] && b.density <= tg.density[1] && b.viscositySec >= tg.viscositySec[0] && b.viscositySec <= tg.viscositySec[1];
      return '<tr><td class="num small">' + esc(date(b.date)) + '</td><td>' + openLink('asset', b.millAssetId, by.assets[b.millAssetId].code) + '</td>' +
        '<td>' + openLink('recipe', b.recipeId, L(recipe.name) + ' v' + recipe.version) + '</td>' +
        '<td class="end num">' + num(b.batchKg) + '</td><td class="end num">' + num(b.density) + '</td><td class="end num">' + num(b.viscositySec) + '</td>' +
        '<td>' + (ok ? chip(t('s.ok'), 'pos', true) : chip(t('qc.offSpec'), 'bad', true)) + '</td></tr>';
    }).join('');
    var table = '<div class="table-wrap"><table><thead><tr><th>' + esc(t('c.date')) + '</th><th>' + esc(t('c.mill')) + '</th><th>' + esc(t('c.recipe')) + '</th>' +
      '<th class="end">' + esc(t('glaze.kg')) + '</th><th class="end">' + esc(t('d.density')) + '</th><th class="end">' + esc(t('d.viscosity')) + '</th><th>' + esc(t('c.status')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

    return pageHead(L(MODULE_BY_ID.glaze.name), t('glaze.sub'), 'g.production') + stats +
      '<section class="card"><div class="section-title"><h2>' + esc(t('glaze.tableTitle')) + '</h2></div>' + table + '</section>';
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
        var dueAt = a.meterAtLastPm + a.pmInterval;
        next = esc(t('pm.atMeter', { n: num(dueAt), u: t('pm.unit.' + a.pmBasis) })) + (a.meter >= dueAt ? ' <span class="chip bad">' + esc(t('pm.overdue')) + '</span>' : '');
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
    shiftReport: function (s) {
      var events = DB.downtimeEvents.filter(function (e) { return e.line === s.line && e.date === s.date && e.shift === s.shift; });
      var eventsHtml = events.length ? '<ul class="linklist">' + events.map(function (e) {
        var code = DB.codes.downtime.filter(function (c) { return c.id === e.codeId; })[0];
        return '<li><span>' + esc(L(code.name)) + '</span><span class="num">' + num(e.minutes) + ' ' + t('prod.minUnit') + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted small">—</p>';
      var defects = DB.defectOccurrences.filter(function (d) { return d.shiftReportId === s.id; });
      var defectsHtml = defects.length ? '<ul class="linklist">' + defects.map(function (d) {
        return '<li><span>' + esc(L(by.defects[d.defectCodeId].name)) + '</span><span class="num">' + num(d.m2) + ' ' + m2() + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted small">—</p>';
      var body = facts([
        [t('c.line'), esc(L(LINE[s.line].name))], [t('c.shift'), esc(L(DB.company.shifts.filter(function (sh) { return sh.id === s.shift; })[0].name))],
        [t('c.date'), esc(date(s.date))], [t('c.product'), openLink('product', s.productId, L(by.products[s.productId].name))],
        [t('d.supervisor'), openLink('employee', s.supervisorId, L(by.employees[s.supervisorId].name))],
      ]) + block(t('d.production'), facts([
        [t('d.pressed'), num(s.pressedM2) + ' ' + m2()], [t('d.kilnIn'), num(s.kilnInM2) + ' ' + m2()], [t('d.kilnOut'), num(s.kilnOutM2) + ' ' + m2()],
        [t('d.first'), num(s.firstM2) + ' ' + m2()], [t('d.commercial'), num(s.commercialM2) + ' ' + m2()], [t('d.second'), num(s.secondM2) + ' ' + m2()],
        [t('d.downtimeMin'), num(s.downtimeMinutes)], [t('d.gas'), num(s.gasM3) + ' ' + m3()],
      ])) + block(t('d.downtimeEvents'), eventsHtml) + block(t('d.shiftDefects'), defectsHtml);
      return drawerFrame('k.shiftReport', L(LINE[s.line].name) + ' · ' + date(s.date), chip(L(DB.company.shifts.filter(function (sh) { return sh.id === s.shift; })[0].name), '', true), body);
    },
    labTest: function (q) {
      var test = by.tests[q.testCodeId];
      var spec = q.family ? test.spec[q.family] : null;
      var refLabel;
      if (q.refType === 'lot' && by.sortingLots[q.refId]) refLabel = by.sortingLots[q.refId].lotNumber;
      else if (q.refType === 'material' && by.materials[q.refId]) refLabel = openLink('material', q.refId, L(by.materials[q.refId].name));
      else refLabel = q.refId;
      var body = facts([
        [t('c.test'), esc(L(test.name))], [t('c.stage'), esc(L(DB.codes.testStages[q.stage]))], [t('d.testStandard'), esc(L(test.standard))],
        spec ? [t('d.testSpec'), specText(spec) + ' ' + esc(L(test.unit))] : null,
        [t('d.testValue'), num(q.value, 2) + ' ' + esc(L(test.unit))], [t('c.date'), esc(date(q.date))],
        [t('d.testRef'), refLabel], [t('d.testBy'), openLink('employee', q.by, L(by.employees[q.by].name))],
      ]);
      return drawerFrame('k.labTest', L(test.name), q.pass ? chip(t('s.pass'), 'pos') : chip(t('s.fail'), 'bad'), body);
    },
    lot: function (l) {
      var available = l.m2 - l.reservedM2 - l.dispatchedM2;
      var body = facts([
        [t('c.product'), openLink('product', l.productId, L(by.products[l.productId].name))], [t('c.line'), esc(L(LINE[l.line].name))],
        [t('c.date'), esc(date(l.date))], [t('c.shift'), esc(L(DB.company.shifts.filter(function (sh) { return sh.id === l.shift; })[0].name))],
        [t('sort.shiftReport'), openLink('shiftReport', l.shiftReportId, L(LINE[l.line].name) + ' · ' + date(l.date))],
        [t('c.site') + '/' + t('c.bin'), openLink('warehouse', l.warehouseId, L(by.warehouses[l.warehouseId].name))],
      ]) + block(t('sort.quantities'), facts([
        [t('c.m2'), num(l.m2) + ' ' + m2()], [t('sort.boxes'), num(l.boxes)],
        [t('sort.reserved'), num(l.reservedM2) + ' ' + m2()], [t('sort.dispatched'), num(l.dispatchedM2) + ' ' + m2()], [t('c.available'), num(available) + ' ' + m2()],
      ]));
      return drawerFrame('k.lot', l.lotNumber, chip(l.grade, l.grade === 'G1' ? 'pos' : l.grade === 'G2' ? 'warn' : 'bad', true) + chip(l.shade, '', true), body);
    },
  };
  var KIND_SOURCE = { product: 'products', material: 'materials', recipe: 'recipes', asset: 'assets', part: 'spareParts', warehouse: 'warehouses', supplier: 'suppliers', dealer: 'dealers', employee: 'employees', shiftReport: 'shiftReports', labTest: 'labTests', lot: 'sortingLots' };

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
  var PAGES = {
    exec: renderExecDashboard, lines: renderProductionDashboard, quality: renderQualityDashboard,
    planning: renderPlanningPage, prep: renderPrepPage, glaze: renderGlazePage,
    sorting: function () { return renderListPage('sortingLots'); },
  };
  function renderPage() {
    if (state.page === 'profile') return renderProfile();
    if (state.page === 'codes') return renderCodes();
    if (PAGES[state.page]) return PAGES[state.page]();
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
  function syncBodyLock() {
    var menuOverlay = state.navOpen && window.matchMedia && window.matchMedia('(max-width: 960px)').matches;
    document.body.classList.toggle('locked', state.drawer.length > 0 || !!menuOverlay);
  }
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
      refocus('th[data-key="' + key + '"]');
    },
    page: function (el) {
      var id = el.getAttribute('data-list');
      var forward = Number(el.getAttribute('data-to')) > listState(id).page;
      listState(id).page = Number(el.getAttribute('data-to'));
      refreshListBody(id);
      refocus('[data-action="page"]:not([disabled])' , forward);
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

  window.addEventListener('hashchange', function () {
    var id = (location.hash || '').slice(1);
    if (pageExists(id) && id !== state.page) { state.page = id; state.drawer = []; state.navOpen = false; render(); }
  });
  var fromHash = (location.hash || '').slice(1);
  if (pageExists(fromHash)) state.page = fromHash;
  render();
})();
