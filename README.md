# Coach Ayman's Command Center

أريد إنشاء تطبيق مقصورة القيادة الذكية لكابتن أيمن (Coach Ayman Swimming & Relax Fix Hub - Abu Dhabi) كمنصة ويب حديثة فائقة التطور، بتصميم مستقبلي إبداعي (Cyber Command HUD / Dark Glass) يعطي شعور العالم الافتراضي وسهولة التنقل المطلقة، مع الأدوات الآتية:

1. مقصورة القيادة الرئيسية (Cockpit View):

- شريط علوي ذكي لحالات الاتصال الحية (واتساب، فيسبوك، إنستغرام، تيك توك، وكوتش براين).
- مركز إشعارات حي لمتابعة كل حركة في النظام.
- لوحة متابعة فورية للمنشورات وحالاتها الحقيقية (Scheduled, Claimed, Published, Needs Review).
- حماية صريحة وصفر أزرار وهمية: كل زر يقوم بإجراء حقيقي، ولا نشر تلقائي أو سحب رصيد دون موافقة يدوية.

2. مصنع المحتوى المرن (Content Factory):

- حرية مطلقة للمالك في تحديد مدة خطة النشر (يومي، 3 أيام، أسبوع، أو فوري) دون إجبار على مدة معينة.
- دعم كامل لمنصات: فيسبوك، إنستغرام، وتيك توك (بفرع مستقل لفيديوهات 9:16).
- بطاقات مراجعة واضحة مع زر موافقة وجدولة وزر تعديل ذكي.

3. كوتش براين الشامل (Coach Brain):

- مستشار سباحة فني ذكي: يحلل أخطاء التكنيك (حرة، صدر، ظهر، فراشة)، علاج رهبة الماء، والتأهيل الحركي، مع باحث فني لأفضل الأساليب العالمية.
- المحرك التجاري لأبوظبي: الفروع الأربعة (المشرف، الفلاح، مدينة خليفة، الدانة/النجدة)، وأسعار الحصص (150 و 250 درهماً للحصص الخاصة، و 450 درهماً لمجموعات الأطفال مع خصم الإخوة 400 درهم).
- مستشار الحملات الإعلانية الممولة: اقتراح أفكار إعلانات لمنصات التواصل وتقدير التكلفة والميزانية.

4. مركز واتساب الذكي (WhatsApp Concierge):

- صندوق رسائل يعرض استفسارات العملاء الواردة.
- صياغة ردود فورية مقترحة من كوتش براين مع إمكانية تعديلها أو إرسالها بنقرة زر.
- اعتماد رقم الحجز الرسمي المعتمد (058 821 9130) وفصل رقم الإدارة المخصص للمكالمات فقط (055 137 8660).

5. خزانة الوسائط الحرة (Media Vault):

- إمكانية الرفع المباشر من الهاتف أو الكمبيوتر.
- خيارات ربط سحابية مرنة غير مقيدة (Google Drive, Google Photos, Dropbox, Canva).
- إمكانية اختيار محرك الذكاء الاصطناعي المفضل (OpenAI, Gemini, Runway).

الواجهة ثنائية اللغة (عربي / إنجليزي) وسريعة الاستجابة على كل الأجهزة.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d5ce83de-4d5c-4f7a-94e8-b5df6a443464).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
cp .env.example .env
npm run dev
```

## Deployment

This project is configured to build as a Cloudflare Nitro app and deploy from the generated prebuilt output.

```sh
cp .env.example .env
npm run deploy
```

Configure only the integrations you intend to use as Cloudflare Worker secrets/variables before deploying:

- `OWNER_PUBLISH_PIN` (min 8 chars; also unlocks the owner session)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (durable storage — apply `supabase/migrations/*.sql` in the Supabase SQL editor first)
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (webhook URL: `https://<domain>/api/whatsapp`)
- `FACEBOOK_PAGE_ACCESS_TOKEN`
- `INSTAGRAM_ACCESS_TOKEN`
- `OPENAI_API_KEY` or `GEMINI_API_KEY` / `GOOGLE_API_KEY`
- `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET`
- `CANVA_REDIRECT_URI` (set to the deployed domain and registered in the Canva developer console)

Publishing and AI integrations stay unavailable until their respective secrets are configured. Durable state (PIN attempt limiter, publish idempotency keys, Canva tokens, posts, WhatsApp inbox) lives in Supabase when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are set. Tables have RLS enabled with no policies, so only the server (service role) can access them. Without Supabase the app falls back to per-instance memory and reports those integrations as "limited", never "verified".

Owner-only endpoints (`/api/posts`, `/api/whatsapp/messages`, Canva connect) require an owner session: unlock it once with the owner PIN in the UI (HttpOnly cookie, 7 days).

To deploy an already-built `.output` directory:

```sh
npx nitro deploy --prebuilt
```
