---
name: collect-video-learning-notes
description: Collect screenshots and the user's own text while they study a video, wait until they indicate they are finished, then clarify the material's logic and use organize-minibook-notes to write it into the mini-book repository. Use when the user wants to continuously send video-learning material before any final organization or filing.
---

# 收集视频学习笔记

在同一个任务中持续接收用户的视频学习素材。收集期间只做必要的摘录与确认；用户明确表示发送完毕后，先梳理知识逻辑，再使用仓库中的 `organize-minibook-notes` Skill 正式落盘。

## 开始收集

- 记录用户正在学习的主题，用它判断最终适合的书籍和章节。
- 用户没有说明主题时，提示其补充；提示不能阻断素材收集，用户可以先继续发送。
- 把最近一次明确开始收集视为本批素材的起点，不混入更早的无关对话。

## 接收素材

用户通常发送视频截图或自己总结的文字：

- 对截图立即摘录与主题有关的文字，并说明图表、公式或代码承载的关键信息。无法辨认或存在歧义的内容要标明，不得猜测。
- 对用户文字保留原意，并在理解素材时区分视频观点、用户理解、疑问、例子与待验证内容。
- 回复以简短确认为主；只有素材无法可靠理解且会影响最终笔记时才追问。
- 在用户发出结束信号前，不生成完整总结，不写入正式笔记，不修改 Markdown 或 `toc.yml`。
- 用户临时要求解释某张截图或某个概念时，可以就地回答，但不要因此默认本次收集已经结束。

## 识别结束信号

将“我发完了”“可以开始总结了”“现在可以整理了”“帮我捋顺一下”等明确表达完成或允许总结的自然语言视为结束信号。语义不明确时继续收集，不要擅自结束。

## 梳理逻辑

收到结束信号后，先把本批素材加工成连贯的整理稿：

1. 汇总截图摘录和用户文字，删除重复内容。
2. 按概念依赖、因果关系或学习过程重排零散观点，而不是按消息顺序机械拼接。
3. 区分视频内容、用户理解、用户疑问和未确认信息；不要把用户推测写成视频或事实结论。
4. 修正明确的识别错误和前后矛盾；无法安全判断时保留疑问或向用户确认。
5. 补足帮助理解的过渡，但不得臆造视频内容、运行结果或事实依据。

## 整理并落盘

逻辑梳理完成后，读取并遵循相邻的 `../organize-minibook-notes/SKILL.md`，把整理稿及以下信息作为其输入：

- 学习主题；
- 截图摘录和必要的图表、公式或代码说明；
- 用户自己的理解、疑问及待验证内容；
- 用户指定的书籍、章节或其他存放要求。

由 `organize-minibook-notes` 检查仓库结构、选择或确认存放位置、重写为独立可读的中文 MyST Markdown、更新 `toc.yml` 并验证结果。只有一个明显匹配位置时可以直接使用；多个实质性候选且误放代价较高时，在写入前询问用户。
