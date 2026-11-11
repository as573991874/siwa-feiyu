# DeepSeek-chan VRM

<p align="center">
  <a href="README.md">日本語</a> · <a href="README.en.md">English</a> · 简体中文
</p>

<p align="center">
  <img src="docs/images/preview.png" alt="DeepSeek-chan 的 VRM 模型，T 姿势的正面、左前方和背面" width="100%">
</p>
<p align="center"><sub>在 Blender 中显示的模型（无阴影，为便于查看调亮了画面）。从左到右：正面、左前方、背面。</sub></p>

这是 DeepSeek-chan 的 VRM 1.0 模型，使用角色建模工具包 [Charakuru（きゃらくる）](https://github.com/nanocle/Charakuru) 制作。

> [!NOTE]
> **这是非官方的粉丝作品。** DeepSeek-chan 不是 DeepSeek 的官方角色，与 DeepSeek 没有关联。DeepSeek 的名称和标志归各自的权利人所有。

## 关于 DeepSeek-chan

DeepSeek-chan 是以 AI DeepSeek 为原型的粉丝角色。角色的详细介绍请参阅萌娘百科的「[DeepSeek娘](https://zh.moegirl.org.cn/DeepSeek%E5%A8%98)」词条。

## 文件

| 文件 | 内容 |
| --- | --- |
| `DeepSeek-chan.vrm` | 完成的 VRM 1.0 模型，可以直接在支持 VRM 的应用中打开。 |
| `DeepSeek-chan.blend` | 导出 VRM 所用的 Blender 文件（使用 Blender 5.2 和 VRM Add-on for Blender 制作）。贴图已打包在文件内。 |
| [`voice/`](voice/README.md) | 声音的制作方法（Qwen3-TTS，日语）和声音样本。 |

## 模型规格

- VRM 1.0，材质为 MToon
- 表情：18 个预设表情（喜、怒、哀、乐、惊讶、眨眼、元音口型、视线等），以及组成这些预设的 23 个部件表情
- 视线：通过表情（形态键）控制
- 摇摆骨骼：40 条（头发、裙子、鲸鱼尾巴、丝带），碰撞体 11 个
- 面数：约 9.2 万（几乎全部为三角面）

## 使用条款

本模型以 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) 发布，适用于 `DeepSeek-chan.vrm` 和 `DeepSeek-chan.blend`。

- 署名：需要。请注明下方的「署名信息」。
- 商业使用：不可以。
- 修改和再分发：可以。公开修改后的作品时，请同样以 CC BY-NC-SA 4.0 发布。

由于原始角色设计以 CC BY-NC-SA 4.0 发布，本模型也采用相同的许可证。VRM 的元数据中也登记了这些条款。完整的许可证文本请参阅 [LICENSE](LICENSE)。

## 署名信息

- 原作角色「溟月」：上善无形（[原作者的投稿](https://www.bilibili.com/opus/1231977657712771073)，CC BY-NC-SA 4.0）
- 女仆版设计：ZipZipPipe（[素材使用声明](https://t.bilibili.com/1231980045693616162)，CC BY-NC-SA 4.0）
- 3D 模型：ニケ（Nike）

## 使用 Charakuru 制作

一般的 VRM 由人在 Blender 或 VRoid Studio 中制作造型，而这个模型采用了不同的方法。修改模型前了解以下差异，会更容易上手。

### 制作方法的差异

一般的 VRM 由人在 VRoid Studio 或 Blender 中制作造型，设置骨骼和权重，再用 UniVRM 或 VRM Add-on for Blender 转换为 VRM。

使用 Charakuru 时，从一张角色插画开始，由人和 AI 智能体分工完成。

1. AI 智能体根据原始插画，绘制头部（含头发）和身体各 4 个方向的图片，以及全身三视图。
2. AI 智能体操作 [Tripo](https://www.tripo3d.ai/)，根据这些图片生成头部和身体的 3D 模型候选。由人选择要使用的候选。贴图生成和绑定也在 Tripo 中完成。
3. AI 智能体操作 Blender，完成部件的分离和分类，并设置权重（从工具包附带的素体转移）、摇摆骨骼和表情。
4. 人在本地应用中检查图片、候选、身体比例和动作并做出判断。没有需要人直接操作 Blender 的步骤。

发布前的修正（表情、眨眼、手指、裙子、尾巴、脖子根部的缝隙等）也由 AI 智能体通过 Blender 脚本完成。

### 修改时的注意事项

- **网格是 AI 生成的三角面网格。** 它不像手工制作的模型那样由四边面和循环边整理而成，因此难以进行依赖循环选择或细分的编辑。
- **脸部和后脑勺是分开的网格。** `Head` 只包含脸的前侧，后脑勺由 `Hair`（头发）覆盖。去掉头发后，头的后方是开口的。
- **贴图是按部件生成的 4K 图片。** 头部、头发、上半身、配饰等各有自己的贴图，并不是在一张手工排布的 UV 上绘制的。
- **摇摆部件是独立的网格。** 摇摆的发束、裙子、尾巴和丝带被分成名为 `Spring_xx_...` 的网格。
- **表情是用脚本制作的形态键。** `Head` 的形态键被登记为部件表情（`detail_...`），预设表情由它们组合而成。
- **保留了制作管理用的名称。** Blend 文件中有以 `CharaKit_` 开头的场景和集合。这些是 Charakuru 在制作时用于管理的名称，与 VRM 的运行无关。

## 更新记录

- 2026-10-31：发布修正了脖子根部缝隙的版本
- 2026-10-31：为与原始角色设计保持一致，将许可证改为 CC BY-NC-SA 4.0
- 2026-10-31：修正呆毛看起来与头部分离的问题
