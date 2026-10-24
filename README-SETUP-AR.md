# موقع فريق طقس البتراء — الحزمة الكاملة

تتضمن الحزمة نسخة الموقع المحدثة، خرائط RainViewer وLightningMaps، واجهة خيارات الإشعارات، وملفات إعداد OneSignal وخدمة التنبيهات الخلفية.

## محتويات الحزمة
- `index.html`: الموقع كاملًا بآخر تعديلات الواجهة.
- `logo-petra-weather.png`: شعار الموقع.
- `push-config.js`: ضع فيه معرّف تطبيق OneSignal العام (App ID) فقط.
- `OneSignalSDKWorker.js`: عامل الخدمة الخاص بإشعارات الويب.
- `scripts/send_jmd_alerts.py`: فحص خلاصة التحذيرات وإرسال التحذيرات الجديدة عبر OneSignal.
- `.github/workflows/jmd-alert-push.yml`: سير العمل المجدول لفحص التحذيرات.
- `data/last-alert.json`: سجل منع تكرار التنبيهات.

## تفعيل Push
1. أنشئ تطبيق Web Push في https://onesignal.com/ لموقع `https://talalhamadeen-png.github.io/petraweather/`.
2. افتح `push-config.js` وضع App ID مكان `PASTE_ONESIGNAL_APP_ID_HERE`. هذا المعرف عام ويمكن أن يظهر في الواجهة.
3. لا تضع REST API Key في `push-config.js` أو `index.html` أو أي ملف عام.
4. في GitHub: Settings → Secrets and variables → Actions، أضف السرّين:
   - `ONESIGNAL_APP_ID`
   - `ONESIGNAL_REST_API_KEY`
5. ارفع جميع محتويات هذه الحزمة إلى جذر مستودع `petraweather`، مع الحفاظ على مجلد `.github`.
6. في Settings → Actions → General، اسمح لـ GitHub Actions بالكتابة إلى المستودع (Read and write permissions) حتى يحفظ سجل التنبيهات.
7. من تبويب Actions شغّل `Jordan Meteorological Alerts Push` يدويًا. أول تشغيل يسجل التحذيرات الحالية كخط أساس ولا يرسلها جميعًا دفعة واحدة.
8. بعد نشر GitHub Pages، افتح الموقع عبر HTTPS على الهاتف وفعّل الإشعارات واسمح بها.
9. اختبر الإرسال من لوحة OneSignal، وتحقق من نتيجة التشغيل في GitHub Actions.

## ملاحظات مهمة
- إذا تركت App ID كنص `PASTE_ONESIGNAL_APP_ID_HERE` فلن تعمل خدمة OneSignal حتى تستبدله بمعرّفك.
- لا تضع REST API Key في الملفات العامة؛ استخدم GitHub Secrets فقط.
- الجدولة كل 10 دقائق ليست ضمانًا لوصول فوري؛ قد تتأخر GitHub Actions أو الخلاصة الرسمية.
- تأكد من إعداد نطاق الموقع في OneSignal ومن أن مسار خدمة العامل يطابق مسار GitHub Pages.
- الإشعارات الخلفية غير مفعلة فعليًا حتى تكمل الإعداد والاختبار في حساب OneSignal الخاص بك.


## الثيم المرئي
تم تطبيق ثيم زجاجي داكن مستوحى من كود التصميم المرسل. التغيير بصري فقط ولا يغيّر محتوى الموقع أو بيانات الطقس أو مصادرها أو منطق الإشعارات.

## تحديثات الإصدار الأخير (الموقع والتنبيهات)
- البحث والـ GPS يقتصران على الأردن فقط؛ الموقع الافتراضي: البترا – وادي موسى. عند فتح الموقع لأول مرة يظهر إشعار لاختيار منطقة أو تحديد الموقع.
- مؤشرات الطقس الخطرة تُحسب لموقعك من Open-Meteo (نماذج ECMWF/ICON/GFS) وبيانات الغبار من Copernicus CAMS، وتُحدَّث كل دقيقة أثناء فتح الموقع.
- إشعارات المتصفح تُرسل عبر `sw.js` (ضروري لأندرويد). ارفع الملفين `sw.js` و`petra-alerts-core.js` مع `index.html` إلى نفس المجلد، والموقع يجب أن يعمل عبر HTTPS.
- الإشعارات تعمل أثناء فتح الموقع، وفي الخلفية فقط حيث يسمح المتصفح (تطبيق مثبّت على الشاشة الرئيسية). للتحذيرات الرسمية بعد إغلاق المتصفح يلزم إعداد OneSignal كما في الخطوات أعلاه.
