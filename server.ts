import express from 'express';
import type {Request, Response} from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

interface RfidScanPayload {
  id: string;
  uid: string;
  tanggal: string;
  waktu: string;
  deviceId: string;
  receivedAt: string;
  processed: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Antrean sementara di server perantara untuk data scan dari ESP32 + RC522 (Metode B Wi-Fi)
const scanQueue: RfidScanPayload[] = [];
const recentLogs: RfidScanPayload[] = [];
const MAX_LOGS = 100;

function formatTodayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatCurrentTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function normalizeUid(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

async function startServer() {
  const app = express();

  app.use(express.json({limit: '1mb'}));
  app.use(express.urlencoded({extended: true}));

  // Izinkan CORS untuk perangkat ESP32 atau komputer perantara di jaringan lokal
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Endpoint Metode B: Menerima HTTP POST dari ESP32 + RFID RC522
  app.post('/api/rfid/scan', (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const uid = normalizeUid(body.uid);

    if (!uid) {
      res.status(400).json({
        status: 'error',
        message: 'Field "uid" wajib diisi (contoh: "A1B2C3D4").',
      });
      return;
    }

    const tanggal =
      typeof body.tanggal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.tanggal.trim())
        ? body.tanggal.trim()
        : formatTodayDate();

    const waktu =
      typeof body.waktu === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(body.waktu.trim())
        ? body.waktu.trim().length === 5
          ? `${body.waktu.trim()}:00`
          : body.waktu.trim()
        : formatCurrentTime();

    const deviceId =
      typeof body.device_id === 'string' && body.device_id.trim()
        ? body.device_id.trim()
        : 'ESP32-RC522-01';

    const entry: RfidScanPayload = {
      id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      uid,
      tanggal,
      waktu,
      deviceId,
      receivedAt: new Date().toISOString(),
      processed: false,
    };

    scanQueue.push(entry);
    recentLogs.unshift(entry);
    if (recentLogs.length > MAX_LOGS) {
      recentLogs.pop();
    }

    res.status(200).json({
      status: 'ok',
      message: 'Data scan RFID diterima oleh server perantara.',
      data: entry,
    });
  });

  // Endpoint polling oleh browser (Vanilla JS) untuk mengambil data scan baru dari ESP32
  app.get('/api/rfid/pending', (_req: Request, res: Response) => {
    const pending = scanQueue.filter((item) => !item.processed);
    res.json({
      status: 'ok',
      count: pending.length,
      scans: pending,
    });
  });

  // Endpoint konfirmasi dari browser bahwa scan telah dicatat ke LocalStorage
  app.post('/api/rfid/ack', (req: Request, res: Response) => {
    const body = (req.body || {}) as {ids?: string[]};
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const idSet = new Set(ids);

    for (let i = scanQueue.length - 1; i >= 0; i--) {
      if (idSet.has(scanQueue[i].id)) {
        scanQueue[i].processed = true;
        scanQueue.splice(i, 1);
      }
    }

    res.json({
      status: 'ok',
      acknowledged: ids.length,
    });
  });

  // Endpoint riwayat penerimaan API (untuk pemantauan di halaman Integrasi ESP32)
  app.get('/api/rfid/logs', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      logs: recentLogs.slice(0, 25),
    });
  });

  if (!isProduction) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Absensi Guru SD berjalan di http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan server:', err);
  process.exit(1);
});
