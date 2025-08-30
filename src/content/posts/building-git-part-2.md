---
title: "Building Git: part II"
pubDate: 2025-02-16
description: "This is the first post of my new Astro blog."
ogImage: "https://sunguoqi.com/me.png"
author: "Astro Learner"
image:
  url: "https://docs.astro.build/assets/rose.webp"
  alt: "The Astro logo on a dark background with a pink glow."
tags: ["astro", "blogging", "learning-in-public"]
---
## Building Git: Part II

So, What good going this week?
We are now going to pick up where we left off. You can read the part I [here](https://vikuuu.github.io/2025-02-05-building-git-part-1/).
In this part we are going to extend out `commit` command functionality, to store the `tree` and `commit` also.

### Extending the `commit` commmand

We can store the blob data in our object directory, now we can store trees and commits.

#### Storing the `tree` object

Tree object store the file structure of the repository.
The blob object is pretty much stored as a cat-file in a compressed form,
the tree object is a different story.

Here is what we will see in the tree file stored on disk:

```bash
❯ cat .git/objects/88/e38705fdbd3608cddbe904b67c731f3234c45b | ./inflate.sh

tree 74100644 hello.txt�6%
                          ۩VFJ100644 world.txt��t+$Y$ߙ+\q%
```

We cannot make anything out of it now, let's get the hexdump of this data:

```bash
❯ cat .git/objects/88/e38705fdbd3608cddbe904b67c731f3234c45b | ./inflate.sh | hexdump -C

00000000  74 72 65 65 20 37 34 00  31 30 30 36 34 34 20 68  |tree 74.100644 h|
00000010  65 6c 6c 6f 2e 74 78 74  00 ce 01 36 25 03 0b a8  |ello.txt...6%...|
00000020  db a9 06 f7 56 96 7f 9e  9c a3 94 46 4a 31 30 30  |....V......FJ100|
00000030  36 34 34 20 77 6f 72 6c  64 2e 74 78 74 00 cc 62  |644 world.txt..b|
00000040  8c cd 10 74 2b ae a8 24  1c 59 24 df 99 2b 5c 01  |...t+..$.Y$..+\.|
00000050  9f 71                                             |.q|
00000052
```

We can now see some bits that we can understand. Let's try to understand it together.

Firstly, we see the entry `tree` telling it is a `tree` object stored
on the disk, followed by the length of the content ahead, followed by the _null_ byte that we see as a dot(.) and as `00`
in the hexdump.
Then comes the file's it stores, we have `hello.txt` and `world.txt`, its file mode and file name is stored.

```bash

00000000  74 72 65 65 20 37 34 00  31 30 30 36 34 34 20 68  |tree 74.100644 h|
00000010  65 6c 6c 6f 2e 74 78 74                           |ello.txt...6%...|
00000020                                          31 30 30  |....V......FJ100|
00000030  36 34 34 20 77 6f 72 6c  64 2e 74 78 74 00        |644 world.txt..b|
00000040                                                    |...t+..$.Y$..+\.|
00000050                                                    |.q|
00000052
```

In the above hexdump, we can see the metadata of all the files inside the root
directory, the object type denoted by `tree`, its content length `74` bytes,
followed by the null byte denoted by `.`, first files mode `100644` and its
name `hello.txt` and so forth for all the following files.

Now let's see what all those garbage value in the decompressed output are?

```bash
00000000                                                    |tree 74.100644 h|
00000010                              ce 01 36 25 03 0b a8  |ello.txt...6%...|
00000020  db a9 06 f7 56 96 7f 9e  9c a3 94 46 4a           |....V......FJ100|
00000030                                             cc 62  |644 world.txt..b|
00000040  8c cd 10 74 2b ae a8 24  1c 59 24 df 99 2b 5c 01  |...t+..$.Y$..+\.|
00000050  9f 71                                             |.q|
00000052
```

In the hexdump output we can notice that all these garbage values are the
hash value of the files, that are used to store the file data on the disk.
This tells us where to look to get these files content.

Now get to making this.

```go
// ...
func cmdCommitHandler(commit string) error {
    // Get all the files in the working directory
    allFiles, err := os.ReadDir(gitgo.ROOTPATH)
    if err != nil {
        return fmt.Errorf("Error reading Dir: %s", err)
    }
    workFiles := gitgo.RemoveIgnoreFiles(
        allFiles,
        gitgo.GITGO_IGNORE,
    ) // Remove the files or dir that are in gitignore

    var entries []gitgo.Entries
    for _, file := range workFiles {
        if file.IsDir() {
            continue
        }
        data ,err := os.ReadFile(file.Name())
        if err != nil {
            return fmt.Errorf("Error reading file: %s\n%s", file.Name(), err)
        }

        blobSHA, err := gitgo.StoreBlobObject(data)
        entries = append(entries, gitgo.Entries{
            Path: file.Name(),
            OID: blobSHA,
        })
    }

    // After storing all the blob data
    // create the tree entry
    treeEntry := gitgo.CreateTreeEntry(entries)
    // store the tree data in the .gitgo/objects
    treeHash, err := gitgo.StoreTreeObject(treeEntry)
    if err != nil {
        return err
    }
}
```

After storing all the blob data, its time to store the tree
objects data, so we call all the neccessary function to do so. Well, I have structure my program a little bit because
it was becoming a pain is the \*\*\*, to manage the code a lil

So my new directory structure it this:

```bash
.
├── cmd/
│   └── gitgo/
│       ├── main.go
│       └── cmdHandler.go
├── go.mod
├── compress.go
├── database.go
├── global.go
├── hash.go
├── inflate.sh
└── utils.go
```

Well what I did was only creating a function for the piece of
code that was being used more than one time. You can see all the changes I did on my Github.

Now let's get back to the matter at hand

`database.go`

```go
package gitgo

import (
    "path/filepath"
    "encoding/hex"
    "bytes"
    "fmt"
    "os"
)

func StoreBlobObject(blobData []byte) ([]byte, error) {
    blobPrefix := fmt.Sprintf(`blob %d`, len(blobData))
    blobSHA := getHash(blobPrefix, string(blobData))
    blob := getCompressBuf([]byte(blobPrefix), blobData)
    hexBlobSha := hex.EncodeToString(blobSHA)
    folderPath := filepath.Join(DBPATH, hexBlobSha[:2])
    permPath := filepath.Join(DBPATH, hexBlobSha[:2], hexBlobSha[2:])
    err := StoreObject(blob, blobPrefix, folderPath, permPath)
    if err != nil {
        return nil, err
    }

    return blobSHA, nil
}

func CreateTreeEntry(entries []Entries) bytes.Buffer {
    var buf bytes.Buffer
    for _, entry := range entries {
        input := fmt.Sprintf("100644 %s", entry.Path)
        buf.WriteString(input)
        buf.WriteByte(0)
        buf.Write(entry.OID)
    }
    return buf
}

func StoreTreeObject(treeEntry bytes.Buffer) (string, error) {
    treePrefix := fmt.Sprintf(`tree %d`, treeEntry.Len())
    treeSHA := getHash(treePrefix, treeEntry.String())
    hexTreeSha := hex.EncodeToString(treeSHA)
    fmt.Printf("Tree: %s", hexTreeSha)
    tree := getCompressBuf([]byte(treePrefix), treeEntry.Bytes())
    folderPath := filepath.Join(DBPATH, hexTreeSha[:2])
    permPath := filepath.Join(DBPATH, hexTreeSha[:2], hexTreeSha[2:])
    err := StoreObject(tree, treePrefix, folderPath, permPath)
    if err != nil {
        return "", err
    }

    return hexTreeSha, nil
}

func StoreObject(
    data bytes.Buffer,
    prefix, folderPath, permPath string
) error {
    err := os.MkdirAll(folderPath, 0755)
    if err != nil {
        return err
    }

    // Create a temp file for writing
    tName := generateGitTempFileName(".temp-obj-")
    tempPath := filepath.Join(folderPath, tName)
    tf, err := os.OpenFile(
        tempPath,
        os.O_RDWR|os.O_CREATE|os.O_EXCL,
        0644,
    )
    if err != nil {
        return fmt.Errorf("Err creating temp file: %s", err)
    }
    defer tf.Close()

    // Write to temp file
    _, err := tf.Write(data.Bytes())
    if err != nil {
        return fmt.Errorf("Err writing to temp file: %s", err)
    }

    // rename the file
    os.Rename(tempPath, permPath)
    return nil
}
```

We are creating multiple function for what we are saving on the disk, well the function are pretty much the same, the `StoreBlobObject` and `StoreTreeObject` do pretty much the same thing, but they have different prefix and data(I will have to look into
it how to make it into one function, buts thats for later). Both function uses the `StoreObject` function that stores there
data into the disk, it does the blah blah blah... you get the idea this is what we did in the previous part. The `CreateTreeEntry`
function creates the data from the slice of the file entries, that will store the file mode, file name, and file's hash.

`compress.go`

```go
package gitgo

import (
    "bytes"
    "compress/zlib"
    "slices"
)

func getCompressBuf(prefix, data []byte) bytes.Buffer {
    var buf bytes.Buffer
    prefix = append(prefix, byte(0))
    w := zlib.NewWriter(&buf)
    w.Write(slices.Concat(prefix, data))
    w.Close()
    return buf
}
```

Here we are compressing the data given to us using the zlib compression method.

`hash.go`

```go
package gitgo

import (
    "crypto/sha1"
    "io"
)

func getHash(prefix, data string) []byte {
    h := sha1.New()
    p := append([]byte(prefix), byte(0))
    io.WriteString(h, string(p))
    io.WriteString(h, data)
    shaCode := h.Sum(nil)
    return shaCode
}
```

Here we are getting the hash of the data.

`utils.go`

```go
package gitgo

import (
    "fmt"
    "math/rand"
    "os"
    "path/filepath"
    "strconv"
)

func RemoveIgnoreFiles(input []os.DirEntry, ignore []string) []os.DirEntry {
    ignoreMap := make(map[string]bool)
    for _, v := range ignore {
        ignoreMap[v] = true
    }

    var result []os.DirEntry
    for _, v := range input {
        if !ignoreMap[v.Name()] {
            result = append(result, v)
        }
    }

    return result
}

func generateGitTempFileName(prefix string) string {
    randomInt := (rand.Intn(999999) + 1)
    return prefix + strconv.Itoa(randomInt)
}
```

In the utility file, we are removing the files that are meant to be ignored(defined currently in a global variable with
only 3 files or dirs in it). And we are generating the temp file name.

#### Storing the `commit` object

Storing the `commit` object is very easy, the output of the printing the commit objects data will look like this:

```bash
❯ cat .git/objects/aa/14833e0f4f21ecf6b7e79d2d305b151c1d728f | ./inflate.sh
commit 171tree 88e38705fdbd3608cddbe904b67c731f3234c45b
author Vikuuu <adivik672@gmail.com> 1739463318 +0530
committer Vikuuu <adivik672@gmail.com> 1739463318 +0530

Initial commit
```

Firstly comes the prefix, in this case `commit` and then the length of the content followed by the null byte, you can check that in the hexdump.

Commits are stored as series of headers and then the commit message

- tree: All commit refer to a single tree that represents the state of your code at this commit,
  instead of storing the diffs it stores the pointer of snampshot to all
  the files and dirs data on that commit, we make it space-efficient by using the compression techniques.

- author: This field is metadata, it contains the name, email and unix timestamp for when it was authored.

- committer: This is also metadata, often same as author. But may differ in case where somebody writes some changes and then someone else amends the commit, or cherry-picks it onto another branch.
  Its time reflects the time the commit was actually written,
  while the author retains the time the content was authored.
  These distinctions originate from the workflow used by the Linux Kernel, which `git` was originally developed to support.

The commit message is what the committer defined in the commit, telling about what was done in the commit.
The user can give an flag `--message` or `-m` and then write there commit message inside the quotes, this
approach can be quite limiting in case of multi-line or long line commit message

Other option is to call the command without any flags, then the git will open the file `.git/COMMIT_EDITMSG` in a text
editor(usually nano). Then the user writes there messages in that file, saves and then closes that file.
The `git` then reads the commit message from this file.
Currently, we will be reading the commit message using the stdin(standard in) file by either echoing the message or using
the cat on the file we stored the commit message in, then piping them
to the `commit` command of out _gitgo_.

What is piping? When we were using the `|` in out terminal to
decompress the git data we were using the pipe operator.
When we use the pipe(|) operator, the terminal then gets the
output of the first command and then gives it to the second
command as its input and so on.

```bash
pacman -Q | grep discord
```

In the above command we are getting all the packages installed on the system(i use arch btw...), getting its output
and then feeding its output to the grep as the input and searching
for the package named discord.

Now, for the case of getting the _author_ and _committer_ detail, git does so by creating a global `.gitconfig` file that defines the users name and email. But for now we will get
the users name and email from the unix environment variable.

When ever you start your terminal or system for that matter your operating system defines some environment variables
run this command in your terminal

```bash
env
```

You will see bunch of key-value pairs, one might feel familiar to you named `PWD`, telling about the present working directory.

So we will firstly export the new environments variable and use them in out code to set the _author_ and _committer_ name,
we can do so by using this command

```bash
export GITGO_AUTHOR_NAME=test
export GITGO_AUTHOR_EMAIL=test@example.com
```

By using this if you restart your terminal or system, these environment variables will be lost, so you will have to re-export
them if that is not a problem then thats good(that's what i did), but for some case you want it to persist you can add these
line to your shells script that start when you log in to your computer or start the terminal, if you are using bash then
in your home dir you will have file `.bashrc` add these line at the end of it, save it and restart it. You can find your
shell startup file in the home dir ending with _rc_.

Lets get to adding the `commit` command to be able to store the `commit` object data.

`cmd/gitgo/cmdHandler.go`

```go
package main

// ...
func cmdHandler(commit string) {
    // ...
    // after saving the tree object

    // Here is we are getting the environment variables
    // that we imported earlier
    name := os.Getenv("GITGO_AUTHOR_NAME")
    email := os.Getenv("GITGO_AUTHOR_EMAIL")
    // Here we are generating the metadata string
    // that we saw how git store the committer and
    // author name, email and timestamp
    author := gitgo.Author{
        Name: name,
        Email: email,
        Timestamp: time.Now(),
    }.New()
    // Currently we are reading from the stdin
    message := gitgo.ReadStdinMsg()
    // creating the data to store on the disk
    commitData := gitgo.Commit{
        TreeOID: treeHash,
        Author: author,
        Message: message,
    }.New()
    // Storing the commit object on the disk
    cHash, err := gitgo.StoreCommitObject(commitData)
    if err != nil {
        return err
    }
}
```

Here we are extending our `cmdCommitHandler` by storing the commit object after storing the tree object.

`database.go`

```go
package gitgo

// ...

type Author struct {
    Name      string
    Email     string
    Timestamp time.Time
}

type Commit struct {
    TreeOID string
    Author  string
    Message string
}

func (a Author) New() string {
    unixTimeStamp := a.Timestamp.Unix()
    utcOffset := getUTCOffset(a.Timestamp)
    return fmt.Sprintf("%s <%s> %d %s", a.Name, a.Email, unixTimeStamp, utcOffset)
}

func (c Commit) New() string {
    lines := []string{
        fmt.Sprintf("tree %s", c.TreeOID),
        fmt.Sprintf("author %s", c.Author),
        fmt.Sprintf("committer %s", c.Author),
        "",
        c.Message,
    }
    return strings.Join(lines, "\n")
}

func ReadStdinMsg() string {
    reader := bufio.NewReader(os.Stdin)
    msg, _ := reader.ReadString('\n')
    return msg
}

func StoreCommitObject(commitData string) (string, error) {
    commitPrefix := fmt.Sprintf(`commit %d`, len(commitData))
    commitHash := getHash(commitPrefix, commitData)
    commit := getCompressBuf([]byte(commitPrefix), []byte(commitData))
    hexCommitHash := hex.EncodeToString(commitHash)
    folderPath := filepath.Join(DBPATH, hexCommitHash[:2])
    premPath := filepath.Join(DBPATH, hexCommitHash[:2], hexCommitHash[2:])
    err := StoreObject(commit, commitPrefix, folderPath, permPath)
    if err != nil {
        return "", err
    }

    return hexCommitHash, nil

}
```

Here we have created some structs to define the author and the commit and the functions associated to them that will
return the metadata that is stored in the commit, which we used in the `cmdCommitHandler` function. A function to read
the input that is given from the stdin, here we are reading till we encounter the new line which is currently a limitation.
Then the usual storing the object to the disk.

Now we will create a new file inside out `.gitgo` directory named `HEAD` that will currently store the commits ID in it.

`cmd/gitgo/cmdHandler.go`

```go

func cmdCommitHandler(commit string) {
    // ...

    HeadFile, err := os.OpenFile(
        filepath.Join(gitgo.GITPATH, "HEAD"),
        os.O_WRONLY|os.O_CREATE,
        0644,
    )
    if err != nil {
        return fmt.Errorf("Err creating HEAD file: %s", err)
    }
    defer HeadFile.Close()

    _, err := HeadFile.WriteString(cHash)
    if err != nil {
        return fmt.Errorf("Err writing to HEAD file: %s", err)
    }
    fmt.Printf("root-commit %s", cHash)

    return nil
}
```

Now, we are done in this blog with the updates in our `commit` command. Let's check the things we have created.

```bash
❯ gitgo init
Initialized empty Gitgo repository in /home/viku/Workspace/personal/go/tests/gitgo-test/.gitgo

❯ echo "This is Initial Commit with gitgo" | gitgo commit
```

Let's see the tree structure.

```bash
❯ tree .gitgo
.gitgo
├── HEAD
├── objects
│   ├── 33
│   │   └── 1a074da94977ec6f12bf1f4d22a670dd1a84bd
│   ├── b0
│   │   └── 05ad2e88861404f2536b36bd0ef31d51767285
│   ├── cc
│   │   └── 628ccd10742baea8241c5924df992b5c019f71
│   ├── ce
│   │   └── 013625030ba8dba906f756967f9e9ca394464a
│   └── f4
│       └── 805b5f927de718c2bf531ee024c8a81ccc9f86
└── refs

8 directories, 6 files
```

Getting the tree file data.

```bash
❯ cat .gitgo/objects/f4/805b5f927de718c2bf531ee024c8a81ccc9f86 | inflate.sh  | hexdump -C
00000000  74 72 65 65 20 31 31 32  00 31 30 30 36 34 34 20  |tree 112.100644 |
00000010  68 65 6c 6c 6f 2e 74 78  74 00 ce 01 36 25 03 0b  |hello.txt...6%..|
00000020  a8 db a9 06 f7 56 96 7f  9e 9c a3 94 46 4a 31 30  |.....V......FJ10|
00000030  30 36 34 34 20 69 6e 66  6c 61 74 65 2e 73 68 00  |0644 inflate.sh.|
00000040  b0 05 ad 2e 88 86 14 04  f2 53 6b 36 bd 0e f3 1d  |.........Sk6....|
00000050  51 76 72 85 31 30 30 36  34 34 20 77 6f 72 6c 64  |Qvr.100644 world|
00000060  2e 74 78 74 00 cc 62 8c  cd 10 74 2b ae a8 24 1c  |.txt..b...t+..$.|
00000070  59 24 df 99 2b 5c 01 9f  71                       |Y$..+\..q|
00000079
```

In the output we get our desired output.
Now get the commit object data.

```bash
❯ cat .gitgo/objects/33/1a074da94977ec6f12bf1f4d22a670dd1a84bd | ./inflate.sh
commit 179tree f4805b5f927de718c2bf531ee024c8a81ccc9f86
author test <test@example.com> 1739721755 +0530
comitter test <test@example.com> 1739721755 +0530

This is Initial Commit with gitgo
```

Cool, everything is as we expected it to be.

## Afterwords

So, in this blog we extended our `commit` command to create files for storing the root tree structure and the commit object,
we are no where near what git does but its a good steady start.

In next part we will be working on storing the history.

Code Link: [Github](https://github.com/Vikuuu/gitgo)

Just know this,

> Reinvent the wheel, so that you can learn how to invent wheel
>
> -- a nobody
