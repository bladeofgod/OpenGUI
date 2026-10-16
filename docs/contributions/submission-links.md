# 剩余两份 PR 的网页提交入口

两份现在都提交到 `Core-Mate/OpenGUI` 的 `main`。依赖已写入正文，维护者可按顺序审核和合并。

登录 `bladeofgod` 后点击对应入口，检查自动填好的标题与正文，再点击绿色 **Create pull request**。

## 鸿蒙驱动

[创建鸿蒙驱动 PR（标题与正文已预填）](https://github.com/Core-Mate/OpenGUI/compare/main...bladeofgod:feat/harmonyos-driver-contribution?quick_pull=1&title=feat%28codex%29%3A+add+HarmonyOS+HDC+and+UiTest+driver&body=%23%23+What+changed%3F%0A%0A%2A%2ADepends+on+%23141.%2A%2A+This+stacked+PR+adds+optional+%60OPENGUI_PLATFORM%3Dharmonyos%60+support+to+the+standalone+Codex+plugin+using+local+SDK+HDC+and+device+UiTest.%0A%0AThe+driver+covers+discovery%2C+screenshots%2C+advisory+layouts%2C+input%2C+navigation+and+owned+artifact+cleanup.+Android+remains+the+default+and+retains+its+video-readiness+gate%3B+HarmonyOS+uses+screenshot+sessions.%0A%0AThe+current+%60main%60+comparison+includes+the+prerequisite+confirmation+fix%3A+3+commits+and+37+files.+The+%5BHarmonyOS-only+comparison%5D%28https%3A%2F%2Fgithub.com%2Fbladeofgod%2FOpenGUI%2Fcompare%2Ffix%2Fnative-confirmation-reply...feat%2Fharmonyos-driver-contribution%29+isolates+this+feature%27s+36+files.%0A%0A%23%23+Why%3F%0A%0AA+native+HarmonyOS+test+phone+can+reuse+Codex+sessions%2C+device+locks%2C+budgets+and+screenshot-based+GUI+operation+through+an+opt-in+local+driver.+The+scope+is+the+standalone+plugin.%0A%0A%23%23+Testing%0A%0A-+First+full+run%3A+134%2F135+passed%3B+an+unchanged+launcher+fixture+timed+out.+All+8+launcher+tests+passed+on+focused+retry+without+relaxing+timeouts.%0A-+TypeScript%2FCLI+build%2C+validation%2C+packaging%2C+installer+syntax+and+isolated+packaged-install+checks+passed.%0A-+Coverage+includes+HDC+acknowledgments%2C+quoting%2C+layout+changes%2Flimits%2C+coordinate+scaling%2C+input%2C+cancellation+and+cleanup.%0A-+Local+macOS+arm64+%2F+Node.js+24.15.0+%2F+pnpm+10.31.0+results+are+separate+from+remote+pinned-version+CI.%0A%0A%23%23+Device+verification%0A%0A2026-10-16%2C+source+%60371481a%60%2C+TYR-AL00%2C+HDC+3.2.0f%3A+opened+a+screenshot+session%2C+observed+the+launcher%2C+swiped+to+an+adjacent+page+and+back+with+image+verification%2C+then+closed+the+session+and+verified+screenshot+removal.+The+capability+probe+passed%3B+the+current+API%2FUiTest+versions+were+not+separately+recorded.%0A%0AAndroid+hardware%2C+API+17+hardware%2C+multiple+physical+devices+and+unattended+soak+were+not+checked+in+this+smoke+test.%0A%0A%23%23+Notes%0A%0AMerge+order%3A+%23141%2C+then+this+PR.+Please+advise+how+this+should+align+with+shared-runtime+work+in+%23104%2C+and+clarify+the+plugin+MIT+declaration+versus+root+contributor+licensing+terms.+Advisory+nodes+never+replace+screenshot+verification.+Raw+device+content+is+not+attached.%0A)

- 标题：`feat(codex): add HarmonyOS HDC and UiTest driver`
- compare 分支：`feat/harmonyos-driver-contribution`
- 当前对 `main` 的比较应显示：3 个提交、37 个文件；独立功能差异为 36 个文件。
- [核对或手工复制正文](02-harmonyos-driver.md)：从 `## What changed?` 起复制。

## 精简观察输出

[创建精简观察输出 PR（标题与正文已预填）](https://github.com/Core-Mate/OpenGUI/compare/main...bladeofgod:feat/compact-observation-contribution?quick_pull=1&title=feat%28codex%29%3A+add+compact+observations+with+private+JSON+evidence&body=%23%23+What+changed%3F%0A%0A%2A%2ADepends+on+%23141+and+the+HarmonyOS+driver+PR+from+%60bladeofgod%3Afeat%2Fharmonyos-driver-contribution%60.%2A%2A+This+stacked+PR+adds+optional+%60--compact%60+observation+output+and+owner-only+complete+JSON+evidence+at+%60observationPath%60.%0A%0ACompact+output+retains+observation+IDs%2C+screenshot+coordinates%2C+layout+stability%2C+focused+inputs+and+action+assessment.+Default+output+stays+complete%3B+JPEG+and+JSON+follow+the+same+session+cleanup+lifecycle.%0A%0AThe+current+%60main%60+comparison+includes+both+prerequisites%3A+5+commits+and+41+files.+The+%5Bcompact-output-only+comparison%5D%28https%3A%2F%2Fgithub.com%2Fbladeofgod%2FOpenGUI%2Fcompare%2Ffeat%2Fharmonyos-driver-contribution...feat%2Fcompact-observation-contribution%29+isolates+this+feature%27s+12+files.%0A%0A%23%23+Why%3F%0A%0ALarge+advisory+layouts+can+exceed+terminal+output+limits.+Compact+results+keep+the+next-action+context+parseable+while+complete+observations+remain+available+for+targeted+reads.+Results+without+layouts+stay+unchanged.%0A%0A%23%23+Testing%0A%0A-+%60pnpm+exec+vitest+run+--maxWorkers%3D2%60%3A+all+138+tests+across+22+files+passed.%0A-+%60pnpm+build%60%2C+%60pnpm+validate%60%2C+%60pnpm+package%60%2C+installer+syntax+and+isolated+packaged-install+checks+passed.%0A-+Tests+check+JSON+permissions%2Fcontent%2C+compact%2Fdefault+responses+and+session+cleanup.+CLI+integration+runs+on+supported+macOS+hosts.%0A-+Local+Node.js+24.15.0+%2F+pnpm+10.31.0+results+are+separate+from+remote+pinned-version+CI.+Assertions+and+timeouts+were+not+relaxed.%0A%0A%23%23+Device+verification%0A%0A2026-10-16%2C+source+%60386e81e%60%2C+TYR-AL00%3A+opened+a+screenshot+session+and+inspected+a+compact+observation.+Its+complete+JSON+retained+104+layout+nodes+with+mode+0600+and+matching+observation%2Fscreenshot+metadata.+Closing+the+session+removed+JPEG+and+JSON.+This+check+verified+output+and+cleanup+without+repeating+the+driver%27s+navigation+smoke+test.%0A%0A%23%23+Notes%0A%0AMerge+order%3A+%23141%2C+HarmonyOS+driver%2C+then+this+PR.+Omitted+compact+nodes+do+not+establish+that+an+element+is+absent.+Complete+JSON+can+contain+hidden+advisory+text+and+must+remain+private%3B+raw+device+results+are+not+attached.%0A)

- 标题：`feat(codex): add compact observations with private JSON evidence`
- compare 分支：`feat/compact-observation-contribution`
- 当前对 `main` 的比较应显示：5 个提交、41 个文件；独立功能差异为 12 个文件。
- [核对或手工复制正文](03-compact-output.md)：从 `## What changed?` 起复制。

## 提交顺序

1. 已发布的原生确认修复：[PR #141](https://github.com/Core-Mate/OpenGUI/pull/141)。
2. 提交上面的鸿蒙驱动 PR。
3. 提交上面的精简输出 PR，其正文已用完整分支名说明鸿蒙前置依赖，不猜测 PR 编号。

创建后以 GitHub 返回的实际 PR 链接为准。前置尚未合入时，页面会包含前置差异；各正文里的独立比较链接可用于聚焦审查。
