---
title: "Interactive rebase and squashing"
pubDate: 2026-03-19
description: "Did the interactive rebasing, and squashing"
author: "Guts Thakur"
tags: ["git"]
---

Did the interactive rebasing, and squashing

wanted to fix the commit, missed adding the appropriate change to the file in the correct commit
and now the commit is third parent. so for that what i did

committed the file that was to be added

```bash
git add <filename>
git commit -m "fixup! <commit message>"
```

Get the commit hash of the commit that you want the file to be added to. and do
```bash
git rebase -i <commit_hash>~1
```
The `~1` is important, it helps in going to the parent.

git will open the text editor and will have this data.

```
pick <commit-hash-1> <commit-msg-1>
pick <commit-hash-2> <commit-msg-2>
fixup <your-new-fixup-commit-hash> <your-new-fixup-commit-msg>
```

and then reorder it to this
```
pick <commit-hash-1> <commit-msg-1>
fixup <your-new-fixup-commit-hash> <your-new-fixup-commit-msg>
pick <commit-hash-2> <commit-msg-2>
```

commit-hash-1 is the commit that we want to fix. Then save and quit.
And now you have updated the history of git itself.
