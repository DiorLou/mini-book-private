# Mini Book

这个仓库同时维护多本相互独立的 MyST 笔记，并为每一本生成网页和 PDF。

| 内容 | 源目录 | 网页路径 | PDF |
| --- | --- | --- | --- |
| 计算机与深度学习 | `deep learning/` | `/computer/` | `computer-notes.pdf` |
| 金融投资 | `finance/` | `/finance/` | `finance-notes.pdf` |
| American intonation | `american intonation/` | `/american-intonation/` | `american-intonation.pdf` |
| 记单词 | `vocabulary/` | `/vocabulary/` | `vocabulary-notes.pdf` |

## 本地构建

安装 Node.js 和 MyST 后，在仓库根目录执行（首次需安装 PDF 导出依赖）：

```powershell
npm install -g mystmd
npm ci
npm run install:browser
./scripts/build-all.ps1
```

全部书籍构建完成后，终端会显示编号菜单；输入编号即可用系统默认的
PDF 阅读器打开对应书籍，输入 `0` 则不打开。自动化场景可使用
`./scripts/build-all.ps1 -NoOpenPrompt` 跳过选择菜单。

每个项目的网页和 PDF 会生成在对应目录的 `_build/` 中。例如美式语调 PDF 位于：

```text
american intonation/_build/exports/american-intonation.pdf
```

PDF 直接由浏览器渲染生成的网页，沿用网页的字体、配色、标题、代码块和侧栏，
使用 A3 横向分页，为桌面网页布局留出空间。每章从新页开始，侧栏在该章的各页重复，
并提供 PDF 章节书签和章节跳转链接。PDF 中的搜索、主题切换等按钮不具备网页交互功能。
本地与部署机器的系统字体不同，仍可能存在细微字形差异。

Windows 未安装 Playwright Chromium 时会尝试使用本机 Edge。
GitHub Actions 会自动安装 Chromium 和中文字体。需要纸质 A4 时可在打印对话框中缩放。

只构建一本时，进入它的目录并执行：

```powershell
myst build --html
node ../scripts/export-web-pdf.cjs . american-intonation.pdf
myst build --html
```

以上文件名以美式语调为例，其他书籍使用表格中的 PDF 文件名。
不需要先运行 `myst build --typst`；配置中的 Typst 模板仅保留为手动生成传统书籍版的选项。
第一次 HTML 构建尚无 PDF 时可能提示下载文件不存在，第二次构建会将新 PDF 加入网站。

增量构建发生变化的书籍、启动本地服务器并打开浏览器：

```powershell
./scripts/preview.cmd
```

## 发布

仓库 `DiorLou/mini-book-private` 的可见性为 **Public（公开）**；名称中的 `private` 不代表访问权限。

推送到 `main` 分支后，GitHub Actions 会构建四本书籍，生成首页并部署到 GitHub Pages。
