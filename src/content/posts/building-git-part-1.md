---
title: "Building Git: part I"
pubDate: 2025-02-05
description: "Building Git, implementing `init` and `commit` command"
author: "Guts Thakur"
tags: ["git", "go", "system-tools"]
---
## Building Git : Part I

Recently, I've been tackling with the dilema of what to create for my project as a source of learning. Between the many
choices I decided to go with the **Git** (the one linus built-in 5 days, let's see how much it will take me?). For this I
won't be shooting the bullet in the dark, but trying to navigate my way through the book, [Building Git](https://shop.jcoglan.com/building-git/)
by James Coglan. This book explains the git functionality and codes it in _Ruby_, but I will be building it in _Go_
programming language. 
So I will have to convert it from ruby to go, but ruby being ruby seeing it just currently seems to
me like pseudo-code (almost like magic). 
That's good for me, I'll have to take the psedo-code and the concepts mentioned
in the books and convert it into the go code. 
For now I won't be going to optimise it or any thing like that. I will
do so after completing the book and making a working clone of git, then I will go into the refactoring and making it
more idomatically Go like.

### Git Basics

I will be going on the basics as the feature I will be working at, this will also work as a revision for me `that's great,
I will have to re-read the book yeeeeee... ;(`.

So what the hell is git?

> Git is a free and open source distributed version control system designed to handle everything from small to very large projects with speed and efficiency.
>
> Git is easy to learn and has a tiny footprint with lightning fast performance. It outclasses SCM tools like Subversion, CVS, Perforce, and ClearCase with features like cheap local branching, convenient staging areas, and multiple workflows.
>
> – git

Hmmm... so git helps you to manage your codebase weather small or large. It helps you create different versions of your
code so that you can understand you have done previously, and where you are going currently.
It would have been great if I knew about the git in my school when I had to make the final project. It was a whole lot
of pain maintaning the version of my code and know which one is the latest version. My naming was link final_project,
finalest_project, new_final_project, and so on.

In this post, we will build the `init` & `commit` command. For this we will have to know what git does when these
commands are used by the user.

## git init

User uses the init command for initializing the `.git` folder in their repository for versioning that repository. If no
parameter is provided then it creates the `.git` folder in the directory it was called from, or if you give it the directory
path then it will create it in that folder. When we initialises the `.git` directory, we are greeted with this structure

```
.
├── .git
├── README.md
└── somefile.txt
```

We have `.git` folder in own repository, the dot(.) in the name makes it a hidden folder.
If we inspect the tree structure of `.git` we will see

```
.
└── .git/
    ├── config
    ├── description
    ├── HEAD
    ├── hooks
    ├── info
    ├── objects
    └── refs
```

We will ignore most of these(I don't know what they do yet!), for now we will focus on `.git/objects`. This is the directory that acts as the database of the git, it stores all the data of all the files, directory and there content of it, and how it does that? We will know that by doing.

## Initializing the git repo

I will be calling mine project **gitgo** (no creativity... boring.). You can structure your project however you want.

```go
// main.go
package main

import (
    "flag"
    "fmt"
)

func main() {
    // defining the flag of our cli
    init := flag.String("init", "", "Create .gitgo files in directory")
    flag.Parse()

    // it means that the user entered only: `gitgo` without
    // any flag or parameters
    if len(os.Args) < 2 {
        flag.Usage()
        return
    }

    switch os.Args[1] {
    case "init":
        err := cmdInitHandler(*init)
        if err != nil {
            fmt.Fprintf(os.Stderr, "Error: %s", err)
            os.Exit(1)
        }
    }
}
```

```go
// cmdHandler.go
package main

import (
    "path/filepath"
    "os"
)

func cmdInitHandler(initPath string) error {
    // folders to create inside .gitgo folder
    gitFolder := []string{"objects"}

    // this will give us the working directory from
    // which the cli tool was called
    wd, err := os.Getwd()
    if err != nil {
        return err
    }

    // this means that the user has given us the dir name
    // or path (now that I am seeing this I know an issue
    // with it.)
    if len(initPath) > 0 {
        wd = filepath
    }
    gitPath := filepath.Join(wd, ".gitgo")

    // creating all the dir defined in the gitFolder slice
    for _, folder := range gitFolders {
        err = os.MkdirAll(filepath.Join(gitPath, folder), 0755)
        if err != nil {
            return err
        }
    }
    fmt.Fprintf(os.Stdout, "Initialized empty gitgo repository in %s", gitPath)
    return nil
}
```

Most of the code is pretty self explainotary, and I have added the comments to explain. The problem that I mentioned in
the comment is that I am not checking the user input if the directory name and path given by user is correct or not. For
now we will make an assumption that it will be correct(finger crossed.)

This much is the easy part. Now is the part where you have to use your brains a lil.

## Commit command

Now we will start building the `git commit` command, where all the data of the repository is stored in the
`.gitgo/objects` directory. For now we will only be storing the meta-data and the data of all the repo files.

So what do we need? What **git** does it?

When we run the `git commit` command, git tries to take a snapshot of our current folder structure and all the data inside
them. But doing so can make the repository size increase, so we takle it by compressing the data in the files using zlib
compression method.

Git stores the content of the file in the compressed form in the format, if we were to decompress it we will see this

```txt
blob %d\0{now the content of the file in compressed form}
```

The first world tells us the it is a file or blob. %d means it tells us the length of the content of the file followed by
the null byte indicating the end of the metadata and now the actual content is displayed.

Let's say we have a file hello.txt, and it contains only a word "hello" in it. When we see the content of the gits object
file for out hello.txt we will see something like this

```bash
$ cat .git/objects/ce/013625030ba8dba906f756967f9e9ca394464a
xKOR0c
```

This is some gibberish that we see (what is that command, we will see), let's create a script to decompress the data

```inflate.sh
#!/bin/bash
python3 -c "import sys, zlib; sys.stdout.buffer.write(zlib.decompress(sys.stdin.buffer.read()))"
```

Now run this with the getting the file content.

```bash
$ cat .git/objects/ce/013625030ba8dba906f756967f9e9ca394464a
blob 6hello
```

Now we can make some sense of it, we see _blob_ telling us its type, a number _6_ telling the length of the file content,
and then the file's actual content. But where is the null byte that we cannot see in the ASCII representation, but belive
me its there.

Now what is this `$ cat .git/objects/ce/013625030ba8dba906f756967f9e9ca394464a`, more specifically this ce/013..., well
this is the SHA1 hash of the file we created when we ran the `commit` command. The hash is calculated from the content of
the file.

> What is hash?
>
> Hash or more specifically hash function, is a function that takes an input and gives and output, but in our case of SHA1
> the output will always be a 20 byte hexadecimal string. So you can give it any variable length string and it will always
> spit out the 20 byte hexadecimal string. One more benefit of this is for the same content it will always give the same
> output, meaning if the content of the two inputs are same as the output of those will be same. This can tell us if the
> content of the file are changed or not.

The structure is like this,

```bash
.
└── .git/
    └── objects/
        └── ce/
            └── 013625030ba8dba906f756967f9e9ca394464a
```

The first two letter of the hash are used as the folder, and the remaining are used as the file's name.

Now, let's get to building.

```go
// main.go

// ...
func main () {
    // ...
    case "commit":
        err := cmdCommitHandler()
        if err != nil {
            fmt.Fprintf(os.Stderr, "Error: %s", err)
            os.Exit(1)
        }
    // ...
}
```

In the `main.go` we added a new case in our switch statement for the commit
command. Added a new function `cmdCommitHandler` that will take care of all the `commit` functionality.

```go
// cmdHandler.go

GITGO_IGNORE = []string{".", "..", ".gitgo"}

func cmdCommitHandler() error {
    // getting the path from where the command is called
    rootPath, err := os.Getwd()
    if err != nil {
        return fmt.Errorf("Error getting pwd: %s", err)
    }
    gitPath := filepath.Join(rootPath, ".gitgo")
    dbPath := filepath.Join(gitPath, "objects")

    // Get all the files in the working directory
    allFiles, err := os.ReadDir(rootPath)
    if err != nil {
        return fmt.Errorf("Error reading Dir: %s", err)
    }
    workFiles := removeIgnoreFiles(
        allFiles,
        GITGO_IGNORE,
    ) // Remove the files or Dir that are in ignore

    for _, file := range workFiles {
        // Currently ignoring the directories
        if file.IsDir() {
            continue
        }

        // Reading the files content
        data, err := os.ReadFile(file.Name())
        if err != nil {
            return fmt.Errof("Error reading file: %s\n%s", file.Name(), err)
        }

        // this is the blob prefix that will be added
        blobPrefix := fmt.Sprintf(`blob %d`, len(data))

        // getting the SHA-1
        blobSHA := GetObjectHash(blobPrefix, string(data))
        blob := GetCompressBuf([]byte(blobPrefix), data, byte(0))
        hexBlobSha := hex.EncodeToString(blobSHA)

        err = os.MkdirAll(filepath.Join(dbPath, hexBlobSha[:2]), 0755)
        if err != nil {
            return fmt.Errorf("Error creating Dir: %s", err)
        }

        // Create a temp file for writing
        tName = GenerateGitTimeFileName(".time-obj-")
        tempPath := filepath.Join(dbPath, hexBlobSha[:2], tName)
        tf, err := os.OpenFile(
            tempPath,
            os.O_RDWR|os.O_CREATE|os.O_EXCL,
            0644,
        )
        defer tf.Close()
        if err != nil {
            return fmt.Errorf("Err creating tempFile: %s", err)
        }

        // Write to the temp file
        _, err := tf.Write(blob.Bytes())
        if err != nil {
            return fmt.Errorf("Err writing to temp file: %s", err)
        }

        // Rename the file
        permPath := filepath.Join(dbPath, hexBlobSha[:2], hexBlobSha[2:])
        os.Rename(tempPath, permPath)
    }
}

func removeIgnoreFiles(input []os.DirEntry, ignore []string) []os.DirEntry {
    ignoreMap := make(map[string]bool)
    for _, v := range ignore {
        ignoreMap[v] = true
    }

    var res []os.DirEntry
    for _, v := range input {
        if !ignoreMap[v.Name()] {
            res = append(res, v)
        }
    }

    return res
}

func GetObjectHash(blobPrefix, data string) []byte {
    h := sha1.New()
    var prefix []byte
    prefix = append([]byte(blobPrefix), byte(0))
    io.WriteString(h, prefix)
    io.WriteString(h, string(data))
    shaCode := h.Sum(nil)

    return shaCode
}

func GetCompressBuf(prefix, data []byte, nullByte byte) bytes.Buffer {
    var buf bytes.Buffer
    prefix = append(prefix, nullByte)
    w := zlib.NewWriter(&buf)
    w.Write(slices.Concat(prefix, data))
    w.Close()
    return buf
}

func GenerateGiTempFileName(prefix string) string {
    randomInt := (rand.Intn(999999) + 1)
    return prefix + strconv.Itoa(randomInt)
}
```

Phewwww... that was long(that's what she said). Now let's go over the code we have written.

Firstly, we get all the paths that will be required for us.
Using the path, we get all the files, dirs in that path (I think this is not secure as the user can run the command from anywhere so we will have to create a check as
this is the correct repository or path and what not, but
that's not for now :) ). We remove all the files, dirs that
are present in the `GITGO_IGNORE` slice.
Then we loop overall the files & dirs in the `workFiles` slice.
For now we are skipping the directories, then we read the file's data and store it, creating a blob prefix, then
getting the hash from the blob prefix, null byte and file data.
This hash will give us the dir and file name, first 2 character for folder name, and then remaining for file name.

We will create a temporary file and store the compressed data
in it, so that no one can access it while the `commit` command
is working.
After writing to the temp file we rename it to the permanent filename and voila... We are done for now.

## Afterword

In this blog we created two git command

- `gitgo init`
- `gitgo commit`

These command currently do not have all the functionality that is required for the working `git` clone.
But we will get there one step at a time.

In the next post we will try to further enhance these command or create a new command.

You can find my code here: [gitgo](https://github.com/Vikuuu/gitgo)

Just know this,

> Reinvent the wheel, so that you can learn how to invent wheel
>
> – nobody
