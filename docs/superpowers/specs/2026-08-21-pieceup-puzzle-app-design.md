# PieceUp — Puzzle Ödül App'i (Tasarım Spec'i)

**Tarih:** 2026-08-21
**Durum:** Onaylandı, implementasyon planına geçilecek

## 1. Amaç ve Kapsam

PieceUp, Shopify mağazalarına eklenen bir uygulamadır. Mağaza önünde bir
popup açar; müşteri sağdaki puzzle parçalarını soldaki görsele sürükleyip
bırakarak puzzle'ı tamamlar. Tamamlanınca merchant'ın admin panelinden
önceden ayarladığı bir ödül (indirim kodu) müşteriye gösterilir.

Merchant, admin panelinden şunları yapılandırır:
- Puzzle görseli ve parça sayısı
- Ödül tipi (yüzde indirim veya belirli bir ürün için ücretsiz-ürün indirimi)
  ve değeri
- Popup'ın nasıl tetikleneceği (buton / otomatik açılma / ikisi) ve hangi
  sayfalarda gösterileceği
- Oynama sıklığı sınırı (kişi başına bir kez / günde bir kez)

## 2. Genel Mimari

Shopify'ın güncel standart app şablonu kullanılır: **React Router 7 +
Prisma + Polaris + App Bridge** (`shopify-apps` skill referans alınmıştır).
Tek bir Node uygulaması hem admin arayüzünü hem backend API rotalarını
barındırır.

Bileşenler:

- **Admin App** (embedded, Polaris/React, App Bridge ile): Merchant'ın
  puzzle/ödül ayarlarını yönettiği ekran(lar).
- **Storefront widget** (Theme App Extension → app embed block): Vanilla
  JS/CSS ile yazılmış puzzle popup'ı. Polaris burada kullanılmaz — Polaris
  bir admin/React tasarım dilidir, storefront'ta React admin bileşenleri
  çalışmaz. Merchant, tema düzenleyiciden bu embed'i mağazasına ekler.
- **App Proxy** (`/apps/pieceup/...`): Storefront widget'ı backend'e
  doğrudan değil App Proxy üzerinden konuşur. Shop kimliğini güvenli
  şekilde doğrular, ayrı bir API-key/CORS yönetimine gerek bırakmaz.
- **Veritabanı**: Prisma + SQLite (geliştirme) / Postgres (prod).
- **Ödül üretimi**: Puzzle tamamlanınca backend, Shopify Admin GraphQL
  API'sindeki `discountCodeBasicCreate` mutation'ı ile tek kullanımlık,
  o oyuncuya özel bir indirim kodu üretir.

### Reddedilen alternatifler

- **Storefront'ta React/Polaris kullanmak**: Reddedildi — Polaris admin
  tasarım dili olduğu için storefront'ta anlamsız/ağır olurdu; Theme App
  Extension + vanilla JS Shopify'ın önerdiği ve storefront'ta çalışan tek
  yoldur.
- **App Proxy yerine doğrudan public API endpoint**: Reddedildi — shop
  kimlik doğrulama ve güvenlik App Proxy ile çok daha basit ve güvenli
  çözülür.

## 3. Teknik Alt-Kararlar

### 3.1 Sürükle-bırak: Pointer Events (native HTML5 DnD değil)

HTML5 `draggable` API'si dokunmatik ekranlarda güvenilir çalışmıyor.
Shopify mağazalarının trafiğinin büyük kısmı mobil olduğu için bu kabul
edilemez. Bunun yerine `pointerdown` / `pointermove` / `pointerup`
event'leriyle elle yazılmış bir sürükleme mantığı kullanılır — hem mouse
hem touch'ta aynı kod yolu çalışır.

### 3.2 Jigsaw parça şekli: SVG `clip-path`

Her parça, klasik puzzle-parçası eğrilerini (çıkıntı/girinti) üreten
matematiksel olarak hesaplanmış bir SVG `clip-path` ile kırpılır. Her
hücrenin kenar tipi (çıkıntılı/girintili/düz) grid pozisyonuna göre
deterministik olarak hesaplanır, böylece komşu parçaların kenarları
birbirine uyar (örn. [0,0] hücresinin sağ kenarı çıkıntılıysa [0,1]
hücresinin sol kenarı otomatik girintili olur). DOM elementleri
kullanıldığı için (canvas değil) sürükleme ve drop-zone hedef tespiti
basitleşir.

## 4. Veri Modeli (Prisma)

```prisma
model PuzzleConfig {
  id                 String   @id @default(cuid())
  shopDomain         String
  imageUrl           String
  pieceCount         Int      // 4 | 6 | 9 | 12 | 16
  rewardType         String   // "PERCENTAGE_DISCOUNT" | "FREE_PRODUCT_DISCOUNT"
  rewardValue        String   // yüzde değeri ya da hedef ürün ID'si
  triggerMode        String   // "BUTTON" | "AUTO" | "BOTH"
  triggerPage        String   // "CART" | "PRODUCT" | "ALL"
  triggerDelaySeconds Int?    // AUTO modunda kaç saniye sonra açılsın
  playLimitType      String   // "ONCE_EVER" | "ONCE_PER_DAY"
  isActive           Boolean  @default(false)
  startDate          DateTime?
  endDate            DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model PlayRecord {
  id           String   @id @default(cuid())
  shopDomain   String
  identityKey  String   // "customer:<id>" veya "device:<uuid>"
  playDate     String   // "YYYY-MM-DD" (gün bazlı gruplama için)
  completed    Boolean  @default(false)
  discountCode String?
  playedAt     DateTime @default(now())

  @@unique([shopDomain, identityKey, playDate])
}
```

v1'de mağaza başına yalnızca tek bir aktif `PuzzleConfig` desteklenir
(çoklu eşzamanlı kampanya yok).

## 5. Storefront Akışı

1. Widget açıldığında App Proxy üzerinden aktif `PuzzleConfig` çekilir.
   Önce `identityKey` ile "bugün/hiç oynanmış mı" backend'e sorulur —
   oynanmışsa puzzle hiç render edilmeden "zaten katıldın" mesajı
   gösterilir.
2. Görsel `pieceCount`'a göre gride bölünür, her parçaya deterministik
   kenar tipleri atanır, parçalar karıştırılıp sağdaki kart listesine
   yerleştirilir.
3. Bir parça bırakıldığında, bırakma noktası doğru hücrenin merkezine
   belli bir tolerans (hücre boyutunun ~%30'u) içindeyse doğru sayılır,
   snap-in animasyonuyla yerine kilitlenir (artık taşınamaz). Tolerans
   dışındaysa parça CSS transition ile orijinal kart konumuna geri
   döner.
4. Son parça da doğru yerleşince frontend "tamamlandı" event'i
   ateşler ve backend'e completion isteği gönderilir.
5. Merchant henüz aktif bir config oluşturmadıysa ya da `isActive=false`
   ise widget hiç render olmaz (sessizce gizlenir, hata gösterilmez).

## 6. Kimlik Takibi ve Tekrar-Oynama Engeli

- Giriş yapmış müşteriler için Shopify `customerId` kullanılır
  (`customer:<id>`).
- Giriş yapmamış ziyaretçiler için tarayıcıda oluşturulan bir
  cookie/localStorage UUID kullanılır (`device:<uuid>`).
- Bu yöntem atlatılabilir (örn. gizli sekme/cookie temizleme) ama bilinçli
  bir trade-off: ek geliştirme (zorunlu giriş) gerektirmeden, giriş şartı
  olmayan mağazalara uygun bir çözüm olarak kabul edildi.
- Asıl zorlama noktası backend'dedir: `PlayRecord` üzerindeki
  `(shopDomain, identityKey, playDate)` unique constraint'i, aynı gün
  içinde aynı kimlik için ikinci bir kayıt oluşmasını DB seviyesinde
  engeller (race condition'lara karşı da bu korur). `ONCE_PER_DAY`
  modunda bu constraint doğrudan yeterlidir. `ONCE_EVER` modunda backend
  ayrıca, o `identityKey` için *herhangi bir* geçmiş `PlayRecord` olup
  olmadığını kontrol eder (playDate'e bakmaksızın) ve varsa isteği
  reddeder.

## 7. Ödül Üretimi ve Hata Yönetimi

- **Completion endpoint** (`/apps/pieceup/complete`, App Proxy
  üzerinden): İstemcinin "tamamladım" iddiasına güvenlik-kritik bir
  kontrol noktası olarak bakılmaz (para/veri riski yok, pazarlama
  oyunu) — asıl kontrol `playLimitType` unique constraint'idir.
- Geçerli istekte backend, Admin GraphQL API'de `discountCodeBasicCreate`
  çağırır: `usageLimit: 1`, `appliesOncePerCustomer: true`, kod formatı
  `PIECEUP-XXXXXX` (rastgele 6 karakter), **7 gün sabit geçerlilik**
  (v1'de ayarlanamaz).
- Admin API çağrısı başarısız olursa (rate limit / network hatası):
  `PlayRecord.completed` `false` kalır (hak yakılmaz), kullanıcıya
  "ödülün oluşturulamadı, tekrar dene" mesajı gösterilir, bir kere
  otomatik retry yapılır.
- Görsel yükleme (admin tarafı): Shopify'ın `stagedUploadsCreate`
  akışıyla CDN'e yüklenir; boyut/format validasyonu (max 5MB,
  jpg/png/webp) admin formunda yapılır.

## 8. Test Planı

- **Backend (unit)**: Prisma model validasyonları, `playLimitType`
  unique constraint davranışı, discount kod formatı üretimi.
- **App Proxy endpoint'leri (integration)**: config fetch, "daha önce
  oynadı mı" kontrolü, completion + discount issuance akışı (Admin API
  çağrısı mock'lanarak).
- **Storefront widget (manuel + Playwright)**: doğru hücreye
  bırakma→snap-in, yanlış hücreye bırakma→geri dönme, tüm parçalar
  tamamlanınca ödül ekranı. Hem masaüstü (mouse) hem mobil (touch
  emulation).
- **Admin panel (manuel + Playwright)**: görsel yükleme, ayarları
  kaydetme, tetikleme kuralı seçimi.
- Gerçek dev mağazada en az bir manuel uçtan-uca deneme: puzzle
  tamamlanınca gerçek bir Shopify indirim kodu oluştuğunu ve checkout'ta
  çalıştığını doğrulamak.

## 9. v1 Kapsamı Dışında Bırakılanlar

- İstatistik/analitik ekranı yok.
- "Ürün otomatik sepete eklensin" seçeneği yok — sadece indirim kodu.
- Merchant'ın parçaları tek tek elle yükleyip özelleştirmesi yok —
  sadece otomatik bölme.
- İndirim kodu geçerlilik süresi (7 gün) ayarlanamıyor, sabit.
- Çoklu dil / çoklu eşzamanlı puzzle kampanyası yok — mağaza başına tek
  aktif `PuzzleConfig`.

## 10. Kurulum Ön Koşulları

Shopify Partner hesabı ve bağlanacak development store zaten mevcut
(kullanıcı tarafından onaylandı). App, Shopify CLI ile oluşturulup bu
dev mağazaya bağlanacak. App adı: **PieceUp**.
