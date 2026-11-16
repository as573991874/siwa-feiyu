// 把模型从 references/ 复制到 public/models/（该目录不入库）
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = join(dirname(fileURLToPath(import.meta.url)), '..'), refs = join(web, '../references'), out = join(web, 'public/models');
mkdirSync(out, { recursive: true });
const fish = readdirSync(refs).find((d) => d.startsWith('DeepSeek'));
const files = [
  [join(refs, fish, '00_模型文件/DeepSeek-chan/DeepSeek-chan.vrm'), 'DeepSeek-chan.vrm'],
  ...['Construction_Male_04.fbx', 'm103_body_color.jpg', 'm103_body_normal.jpg'].map((f) => [join(refs, 'Rocketbox_Construction_Male_04', f), f]),
];
for (const [src, name] of files) if (!existsSync(join(out, name))) { copyFileSync(src, join(out, name)); console.log('已复制', name); }
