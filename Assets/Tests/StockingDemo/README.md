# 服装材质与动态演示

此演示直接制作于 XXD2025 当前工程，使用项目自有观相堂女弟子。没有使用外部角色模型。

## 打开与播放

打开 `Assets/Tests/StockingDemo/Generated/StockingDemo.unity`，点击 Play。场景自动循环播放 120 秒：保留全景推进、腿部细节、屈膝与脚踝动作和全部款式。大腿、小腿、渔网与裙角拉扯均由角色手臂和手指完成，展示转身由人物换脚与身体重心带动。64 秒后展示六款新增花纹，88 秒后展示百褶裙。

编辑器菜单：

- `XXD/渲染演示/生成丝袜演示场景`：重新生成测试资源和场景。
- `XXD/渲染演示/导出丝袜预览`：导出十个裙摆时间点的实际 Unity 渲染。
- `XXD/渲染演示/导出丝袜完整帧序列`：导出 1920×1080、30fps、120 秒的实际 Unity 渲染序列。

批处理入口为 `StockingDemoBuilder.Preview` / `StockingDemoBuilder.Record`。可用 `STOCKING_OUTPUT` 环境变量指定输出目录，默认 `.claude/jobs/media/swml-v1/frames`。录制命令不加 `-quit`，导出结束后自动退出。

视频编码：

```sh
python3 .claude/tools/stocking-demo/encode_video.py \
  --frames .claude/jobs/media/swml-v1/styles-v4-frames \
  --output .claude/jobs/media/swml-v1/stocking-styles-v4.mp4 --styles
```

## 角色与材质

原角色来源：`Assets/Arts/Models/Monster/GuanXiangTangNvDiZi/Part01/GuanXiangTangNvDiZi@Skin.fbx`。

演示副本保留原头部、上衣、贴图和骨架，按蒙皮后的实际顶点高度裁短长袍，补建绑定原有大腿、小腿、脚骨骼的腿部网格。原 FBX、正式角色 Prefab 和原材质不修改。

`StockingFiber.shader` 使用不透明皮肤/织物复合着色，表现视角相关的透肤深浅；无需透明排序。织纹按屏幕导数过滤，纤维高光沿网格切线方向计算。脚踝与膝后褶皱使用微小顶点位移及法线扰动，膝后强度由姿势控制。`_Denier` 是演示用光学密度参数，尚未按真实丹尼数标定。

v3 拉扯使用独立皮肤与织物表面，橙色点表示抓取位置。拉开时布面可离开皮肤；松手后立即解除抓取约束，不再由隐藏的弹簧质量点控制尖端。

以 120Hz 固定步长积分三维布面节点，主要约束为周向/纵向伸长、剪切距离和较弱的二阶弯曲距离。较强空气阻尼和无恢复系数的皮肤接触负责耗散运动，布面快速收拢，仅保留轻微瞬态颤动。大腿拉离约 14 厘米，小腿约 10 厘米。材质随网格伸长降低光学密度。

这是项目演示用的局部三维布面约束近似，尚未按真实尼龙材料实验标定，也不包含自碰撞、撕裂或全身服装求解。演示中拉扯段保持腿部姿势固定；原有腿部动作在前面的独立章节保留。

验证命令：

```sh
python3 .claude/tools/stocking-demo/verify_fabric.py \
  .claude/jobs/media/swml-v1/fabric-v3-frames/pull-metrics.csv
```

该检查同时验证原有相机推进、屈膝、脚踝动作、三样式比较和浅色材质转换被保留，以及释放后没有大幅连续弹跳、布面重新贴近腿部。

新增场景、材质、网格、URP 渲染配置都在测试目录，不注册到 YooAsset 的正式角色加载流程。演示驱动在启用期间临时切换演示 URP 配置，禁用时恢复先前配置。

## v4 新增款式

原 64 秒流程完整保留，结尾追加两组款式对比和一段中网拉扯，共 88 秒。

| 款式 | Generated 下的材质 | 画面位置 |
|---|---|---|
| 细渔网 | FineFishnet.mat | 64–72 秒左侧 |
| 经典中网 | ClassicFishnet.mat | 64–72 秒中间 |
| 大菱形网 | WideDiamond.mat | 64–72 秒右侧 |
| 花卉蕾丝 | FloralLace.mat | 72–80 秒左侧 |
| 波点薄纱 | PolkaDot.mat | 72–80 秒中间 |
| 后缝款 | BackSeam.mat | 72–80 秒右侧，背面展示 |

80–88 秒为经典中网的抓取、拉开与松手回贴。网眼采用透明覆盖，拉开时能看到下方皮肤与背景；花纹坐标随布面网格变形。使用独立的图案 UV，沿腿部到脚背的弧长连续铺排，避免脚背网眼挤到脚尖。

普通丝袜和拉扯表面共享 `StockingPattern.hlsl` 的网眼、蕾丝、波点与后缝图案。`_PatternType` 控制花纹类别，`_PatternScale` 控制密度，`_PatternWidth` 控制网线粗细。该版本表现为 Shader 覆盖与纤维高光，没有为每根网线建立圆柱几何。

新版录制目录设为 `STOCKING_OUTPUT=.claude/jobs/media/swml-v1/styles-v4-frames` 的绝对路径；编码与验收：

```sh
python3 .claude/tools/stocking-demo/encode_video.py \
  --frames .claude/jobs/media/swml-v1/styles-v4-frames \
  --output .claude/jobs/media/swml-v1/stocking-styles-v4.mp4 --styles
python3 .claude/tools/stocking-demo/verify_fabric.py \
  .claude/jobs/media/swml-v1/styles-v4-frames/pull-metrics.csv
```

## v5 新增百褶裙

前 88 秒丝袜流程保留，88–120 秒追加百褶裙：88–96 秒重心与转身、96–104 秒轻风近景、104–112 秒轻提裙角与放下、112–120 秒三种配色。玫瑰格纹、海军蓝、酒红细格共用同一裙摆网格；新增同色渐扩腰头与不透明内衬；褶根先收平并藏入腰头，下方再逐渐展开。原始角色资源保持不变，只切换演示副本的上衣裁剪网格。

`PleatedSkirtDemo` 使用 96 个周向分段、23 排节点、120Hz 积分，含距离/剪切/弱弯曲约束、固定腰部、腿部胶囊接触、重力、风载与局部抓取。抓取约抬高 22 厘米并向外拉动周围布面，松手后由重力与约束落回。当前是演示用局部坐标布面近似，转身惯性采用程序化载荷；未作真实面料标定，不含自碰撞。橙色点是自动抓取标记。

只录制新 32 秒可设 `STOCKING_START=88 STOCKING_DURATION=32`，同时以 `STOCKING_OUTPUT` 指定输出目录。省略这两个时间参数会录制完整 120 秒。新段编码、数据验证：

```sh
python3 .claude/tools/stocking-demo/encode_video.py \
  --frames .claude/jobs/media/swml-v1/skirt-v5-frames \
  --output .claude/jobs/media/swml-v1/pleated-skirt-v5.mp4 --skirt
python3 .claude/tools/stocking-demo/verify_skirt.py \
  .claude/jobs/media/swml-v1/skirt-v5-frames/pull-metrics.csv
```

交付的完整版以旧 88 秒成片和新 32 秒成片无损拼接，确保原展示内容完整保留。上述编码器的 `--skirt` 只用于 960 帧新段；完整 120 秒原始帧需按章节分别编码。

完整版拼接与验证（检查前 2640 帧与旧视频完全相同）：

```sh
python3 .claude/tools/stocking-demo/assemble_showcase.py \
  --original .claude/jobs/media/swml-v1/stocking-styles-v4.mp4 \
  --skirt .claude/jobs/media/swml-v1/pleated-skirt-v5.mp4 \
  --output .claude/jobs/media/swml-v1/clothing-showcase-v5.mp4
```

## v6 人物亲手拉扯与踏步转身

完整重新录制 120 秒，不拼接旧的自动抓取画面。`GarmentCharacterMotion` 编排预备、够取、捏合、拉开、保持、松手、收回；手臂双骨 IK 对齐实际拇指/食指捏合中点，布面的抓取约束绑定该中点。丝袜前外侧拉开约 14 厘米，小腿约 10 厘米；小腿用单腿支撑与抬腿姿势够取。裙角选择前侧，裙长按参考收为 36 厘米，并保留同色腰头与内衬。

抓取时序（各 8 秒章节内）：0–1.5 秒够取与捏合，1.5–3 秒拉开，3–4.6 秒保持，4.6 秒松手，5.2 秒后收回，6 秒后恢复身体姿势。橙色抓取点与距离线不再出现在画面中。

展示镜头在每个章节固定水平角度，只推进/拉远；转身由两次换脚、脚部 IK、肩头先行和停顿完成。手指由关节旋转和拇指末端 CCD 对齐，属于程序化动作演示，并非动捕或基于碰撞自动寻找抓取点的通用交互系统。

录制时对身体和腿部按当帧骨架烘焙网格，保证画面蒙皮与指尖/布面使用同一帧姿势。裙装上衣使用独立渲染器，腰部蒙皮过渡仅作用于躯干区域，保留袖口与手部权重。

```sh
# STOCKING_OUTPUT must be an absolute path. Omit START/DURATION for all 120 seconds.
STOCKING_REUSE_SCENE=1 STOCKING_OUTPUT=/absolute/path/character-v6-frames Unity \
  -batchmode -projectPath /absolute/path/xxd2025 \
  -executeMethod StockingDemoBuilder.Record -logFile /tmp/character-v6-record.log
python3 .claude/tools/stocking-demo/verify_character.py \
  .claude/jobs/media/swml-v1/character-v6-frames/pull-metrics.csv
python3 .claude/tools/stocking-demo/encode_video.py \
  --frames .claude/jobs/media/swml-v1/character-v6-frames \
  --output .claude/jobs/media/swml-v1/clothing-character-v6.mp4 --character
```

`STOCKING_REUSE_SCENE=1` 复用已生成场景；修改生成器、网格资产或序列化配置后应先生成场景，或省略该变量自动重建。`STOCKING_PREVIEW_TIMES` 可用逗号分隔指定预览时间。v6 验证检查指尖够取误差、捏合间距、布面与手的接触、松手收拢、人物踏步与固定镜头角度，以及全部章节/款式保留。

手部数据中 `hand_reach_error` 表示实际捏合中点与预定轨迹的偏差；手臂达到伸展极限时，轨迹可偏移不超过 2 厘米，布面始终绑定实际手指。`cloth_hand_error` 才是实际指尖与抓取布面的距离，验收阈值为 2 毫米。末端骨骼约 1 厘米间距用于容纳手指垫和被捏起的布面。

成片完整解码与逐章抽帧检查：

```sh
python3 .claude/tools/stocking-demo/verify_video.py \
  .claude/jobs/media/swml-v1/clothing-character-v6.mp4
```
