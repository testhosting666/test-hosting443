// // Fungsi bantu: Ambil nomor zona dari teks notifikasi
// function extractZoneFromBody(body) {
//   const match = body.match(/Zona (\d+)/i);
//   return match ? parseInt(match[1]) : null;
// }

// // === PUSH EVENT: Saat notifikasi dikirim ke browser ===
// self.addEventListener("push", function (event) {
//   const data = event.data.json();

//   const zone = extractZoneFromBody(data.body) || data.zone || null;

//   const options = {
//     body: data.body,
//     icon: data.icon || "/assets/fire-icon.png",
//     vibrate: [200, 100, 200],
//     data: {
//       zone: zone,
//       url: zone ? `/zone/${zone}` : "/", // Bisa diarahkan ke halaman detail zona
//     },
//   };

//   // Tampilkan notifikasi ke user
//   event.waitUntil(
//     self.registration.showNotification(
//       data.title || "🔥 Notifikasi Kebakaran",
//       options
//     )
//   );

//   // Kirim pesan ke semua tab aktif (client pages)
//   self.clients
//     .matchAll({ type: "window", includeUncontrolled: true })
//     .then((clients) => {
//       for (const client of clients) {
//         client.postMessage({
//           type: "new-notification",
//           zone: zone,
//         });
//       }
//     });
// });

// // === NOTIFICATION CLICK EVENT: Saat user klik notifikasi ===
// self.addEventListener("notificationclick", function (event) {
//   event.notification.close(); // Tutup notifikasi

//   const urlToOpen = event.notification.data?.url || "/";

//   event.waitUntil(
//     self.clients
//       .matchAll({ type: "window", includeUncontrolled: true })
//       .then((clientsArr) => {
//         for (const client of clientsArr) {
//           if (client.url === urlToOpen && "focus" in client) {
//             return client.focus();
//           }
//         }
//         // Kalau belum ada tab yang sesuai, buka tab baru
//         if (self.clients.openWindow) {
//           return self.clients.openWindow(urlToOpen);
//         }
//       })
//   );
// });
// Fungsi bantu: Ambil nomor zona dari teks notifikasi
function extractZoneFromBody(body) {
  const match = body.match(/Zona (\d+)/i);
  return match ? parseInt(match[1]) : null;
}

// === PUSH EVENT: Saat notifikasi diterima dari server ===
self.addEventListener("push", function (event) {
  if (!event.data) {
    console.warn("❗ Push event tanpa data");
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (err) {
    console.error("❌ Gagal parse data notifikasi:", err);
    return;
  }

  const zone = extractZoneFromBody(data.body) || data.zone || null;

  const options = {
    body: data.body || "Ada kejadian darurat",
    icon: data.icon || "/assets/icons/alarm-icon.png",
    badge: data.badge || "/assets/icons/alarm-badge.png", // opsional
    vibrate: [300, 100, 300],
    data: {
      zone: zone,
      url: data.url || (zone ? `/zone/${zone}` : "/"),
    },
  };

  // Tampilkan notifikasi ke pengguna
  event.waitUntil(
    self.registration.showNotification(
      data.title || "🔥 Notifikasi Kebakaran",
      options
    )
  );

  // Kirim data ke semua tab terbuka (untuk update UI real-time)
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "new-notification",
            zone: zone,
            event_type: data.event_type || "alarm",
            timestamp: new Date().toISOString(),
          });
        });
      })
  );
});

// === NOTIFICATION CLICK EVENT: Saat notifikasi diklik ===
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsArr) => {
        for (const client of clientsArr) {
          if (client.url.includes(urlToOpen) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});
