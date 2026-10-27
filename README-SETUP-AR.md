# تفعيل التنبيهات والمتصفح مغلق (مرة واحدة فقط)

الموقع وحده لا يستطيع إرسال تنبيهات والمتصفح مغلق. لذلك أضفنا خدمة خلفية مجانية:
GitHub Actions تفحص الطقس كل 10 دقائق لكل مناطق الأردن، وOneSignal يرسل الإشعار إلى هاتفك.

## الخطوات
1. أنشئ حسابًا مجانيًا على https://onesignal.com ثم أنشئ تطبيقًا من نوع **Web Push**.
   - Site URL: `https://talalhamadeen-png.github.io/petraweather/`
   - اختر **Typical Site** وفعّل HTTPS، وفي Service Worker path اكتب `/petraweather/OneSignalSDKWorker.js` و Scope `/petraweather/`.
2. انسخ **App ID** وضعه في ملف `push-config.js` مكان `PASTE_ONESIGNAL_APP_ID_HERE`.
3. من OneSignal: Settings → Keys & IDs، انسخ **REST API Key**.
4. في GitHub (مستودع `petraweather`): Settings → Secrets and variables → Actions → New repository secret، وأضف سرّين:
   - `ONESIGNAL_APP_ID` = معرّف التطبيق
   - `ONESIGNAL_REST_API_KEY` = مفتاح REST
5. Settings → Actions → General → Workflow permissions → **Read and write permissions**.
6. ارفع كل محتويات هذا المجلد إلى جذر المستودع، **مع المجلد المخفي `.github`**.
7. من تبويب Actions شغّل `Petra Weather Alerts Push` يدويًا (Run workflow) وتأكد أنه ينجح (أخضر).
8. على الهاتف: افتح الموقع، فعّل الإشعارات، اختر موقعك وأنواع التنبيهات، واسمح بالإشعارات.

بعدها تصلك التنبيهات حسب منطقتك وأنواعك المختارة حتى لو أغلقت المتصفح.

## ملاحظات
- GitHub قد تؤخر الجدولة بضع دقائق، فالتنبيه شبه فوري وليس لحظيًا.
- الإشعار يُرسل لكل منطقة مرة واحدة كل 6 ساعات لكل نوع.
- لا تضع REST API Key في أي ملف عام، فقط في GitHub Secrets.
- على iPhone تعمل إشعارات الويب فقط بعد إضافة الموقع إلى الشاشة الرئيسية (Add to Home Screen).
- مع تفعيل الخدمة الخلفية، لا تُعرض الإشعارات المحلية أثناء فتح الصفحة (لمنع التكرار).
- التحذيرات الرسمية: الخدمة تعتمد على بيانات التوقعات (Open-Meteo) وليست مصدرًا رسميًا.
