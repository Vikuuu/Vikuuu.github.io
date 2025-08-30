---
title: "Building Git: part III"
pubDate: 2025-03-07
description: ""
ogImage: "https://sunguoqi.com/me.png"
author: ""
image:
  url: "https://docs.astro.build/assets/rose.webp"
  alt: "The Astro logo on a dark background with a pink glow."
tags: []
---
## Building Git: Part III

![Git History](../../assets/git_history.jpg)

Yokosho watashino, part 3 of Building git. In the previous parts we build the `gitgo` capable of storing the flat
directory structure and the files inside it. But having only single commit in the version control system, is not very
useful. We have no relationships between the commits as of now, and it is not helpfull to have all the commits
disoriented, with no way of going back to parent commit. Our first goal was to just commit the contents to get started
with the miniature version of the `git`.

Now, we will be working to make history in this part. Let's get to it.

#### The `parent` field

The `git` adds the new `parent` field in the commit object
on the every subsequent commits to make a history, and to be able to trace all the history. Only the root-commit object
does not have the `parent` field in the commit object, but every following commits contains a `parent` field telling `git`
where this `commit` inherits from, for the case of `merge` the commit has two parents. The `git` uses this to sort all the
`commit` and make a tree structure. **Git** do not uses the timestamp for sorting all the commits as it will be harder,
and not feasable when working with the team, as two people can make a `commit` at same time, so timestamp it not a
good parameter to sort the commits. For this we use the `parent` field, if a user wants the latest 5 commits, we can
easily show the user all the commits by getting the latest commit from the `.git/HEAD` and then tracing the parent `commit` of all the `commit`
till we have 5 `commits`.

It is more robust to put the idea that commit B is derived from commit A into data model; it makes calculating what
changed on different people's branches, and merging those changes together. We will see more on these when we will building
the `merge` and `branch` commands.

##### Differences between trees

Let's get the tree data of the two commits on the test file we made.

```bash
❯ git cat-file -p 88e3870
100644 blob ce013625030ba8dba906f756967f9e9ca394464a	hello.txt
100644 blob cc628ccd10742baea8241c5924df992b5c019f71	world.txt
```

This is the output of the first commit tree structure. Now
let's get the commit tree structure of the second commit

```bash
❯ git cat-file -p 040c6f3e
100644 blob e019be006cf33489e2d0177a3837a2384eddebc5	hello.txt
100644 blob cc628ccd10742baea8241c5924df992b5c019f71	world.txt
```

As we can see that the hash of the file `hello.txt` is different in the both tree object, because the first commits
hello.txt holds the value `hello` and the second commits hello.txt holds the value `second`, so it has the different
hash in the both commits tree structure.

As for the case of file `world.txt` its content remained the same in the both commits, so hash was not different, and
git does not have to store two different compressed files storing the same file content, so git do not save the additional
file for same content across the different commits, it just add the hash of the file, this is how git saves the
storage space for the codebase with millions of line of code and thousands of file.

##### Implementing the `parent` chain

So we do not have to modify our code of storing the `blob` and `tree` object, and keep updating the `.git/HEAD` to
point to the latest commit. We have to add the `parent` hash to the new commits, we can know if the commit is root-commit
or not by checking for the `.git/HEAD` file, if the file exists then the commit is not a root-commit and add the
`.git/HEAD` files hash as the parent hash in the commit object, if we do not find the file, then the commit is a
root-commit and we do not have to add a parent hash to the commit object.

We will introduce an abstraction to updating the `HEAD` file to update the `HEAD` file easily and safely.

`refs.go`

```go
package gitgo

import (
    "os"
    "path/filepath"
)


type ref struct {
    pathname string
    headPath string
}

func RefInitialize(pathname string) ref {
    r := ref{pathname: pathname}
    r.headPath = filepath.Join(r.pathname, "HEAD")
    return r
}

func (r ref) UpdateHead(oid []byte) error {
    flags := os.O_WRONLY|os.O_CREATE
    refFile, err := os.OpenFile(r.headPath, flags, 0644)
    if err != nil {
        return err
    }
    defer refFile.Close()

    _, err = refFile.Write(oid)
    if err != nil {
        return err
    }

    return nil
}
```

Let's add a function that will return the hash string that the `HEAD` file is storing if the file exist, else the
function will return the empty string if the file do not exists, this will tell that the file do not exists, and this
is root-commit.

```go
func (r ref) ReadHead() string {
    _, err := os.Stat(r.headPath)
    if os.IsNotExist(err) {
        return ""
    }

    content, _ := os.ReadFile(r.headPath)
    return string(content)
}
```

Now we can use this in the `commit` handler.

`cmd/gitgo/cmdHandler.go`

```go
	refs := gitgo.RefInitialize(gitgo.GITPATH)
```

Add this line after storing all the blob and tree object.

```go
	author := gitgo.Author{
		Name:      name,
		Email:     email,
		Timestamp: time.Now(),
	}.New()
	message := gitgo.ReadStdinMsg()
	refs := gitgo.RefInitialize(gitgo.GITPATH)
    parent := refs.ReadHead()
    is_root := ""
    if parent == "" {
        is_root = "(root-commit) "
    }

    commitData := gitgo.Commit{
        Parent: parent, // we will add this field to struct
        TreeOID: treeHash,
        Author: author,
        Message: message,
    }.New()
    cHash, err := gitgo.StoreCommitObject(commitData)
    if err != nil {
        return err
    }

    refs.UpdateHead([]byte(cHash))

    fmt.Printf("%s %s %s", is_root, cHash, message)
    return nil
```

Remove the code where we are creating the `HEAD` file in the Handler. Now we need to adjust the `Commit` struct to
add the `Parent` hash string.

`database.go`

```go
type Commit struct {
    Parent  string
    TreeOID string
    Author  string
    Message string
}
```

And now update the `Commit` structs `New()` function.

```go
func (c Commit) New() string {
    lines := []string{}
    lines = append(lines, fmt.Sprintf("tree %s", c.TreeOID))
    if c.Parent != "" {
        lines = append(lines, fmt.Sprintf("parent %s", c.Parent))
    }
    lines = append(lines, fmt.Sprintf("author %s", c.Author))
    lines = append(lines, fmt.Sprintf("committer %s", c.Author))
    lines = append(lines, "")
    lines = append(lines, c.Message)

    return strings.Join(lines, "\n")
}
```

With these changes in place we can now build the executable file from the `cmd/gitgo`, and run the `gitgo` to
create a new commit. We can verify that the new commit has the parent field in it.

Rename `.gitgo` folder to `.git`, and now use the git's command hehehe...

```bash
❯ git cat-file -p 51db7c69
tree 040c6f3e807f0d433870584bc91e06b6046b955d
parent 706f942675c04ef7cd637022b6ec236b2a98e6da
author  <> 1740759443 +0530
comitter  <> 1740759443 +0530

Second Commit
```

So our new commit has the parent field in it. Great.

##### Safely updating `.git/HEAD`

When we were creating our code to store the `blob` object we where first writing to a temp file and then renaming
it to the permanent file name, because there might be a case where we are writing to a file, and at the same time
another program is reading that file, so the reading program will see the uncomplete content written to file.
So for it not to happen we first write to a temp file and when the writing is complete we rename the file to the
permanent file name.

In case of `.git/HEAD` this means that while we are updating the file, other program might try to read it, and it
might see an empty string or a partial hash of the commit.

Files in `.git/objects` never change; because the names of the object files are determined by the files content, under
the assumption that SHA1 is doing its job, so for us it does not matter that which of the two different program wins
because they are writing the same content. All we care that this process appears to be atomic and when we read the file
they have the full content in them. For this purpose it's sufficient to pick a random filename to write the data out to,
and then rename this file.

This is not the case for `.git/HEAD` and other refernces - their while purpose is to have stable, predictable names
and change their content over time, enabling us to find the latest commit without the need to know its ID. Writes to
them must still appear atomic, but we must not preassume that two process are trying to write the same thing to the file.
In fact we should preassume that both are trying to write different references to the file is an error, because unless
those process are explicity co-ordinating with each other, they will probably disagree about the state of the system
and the final value of reference will depend on whichever process finish last.

Such [race condition](https://en.wikipedia.org/wiki/Race_condition) become even more important when data must be read
from a file, then modified or transformed in some way before being written back to the file. Or, when we need to check
the file's current value before deciding whether to overwrite it - we need to know that the value won't be changed by
another process while we're making this decision.

So what can we do? We can solve this problem by introducting a new abstraction called a `Lockfile`. This will be
initialised with the path of the file we want to change, and it will attemp to open a file to write to by appending `.lock` to the original pathname. We need to pick a well-know
name rather than generating a random pathname, because the whole point is to prevent two processes from getting access
to the same resource at once, and this is easier if they're both trying to access the same file.

Let's begin writing.

`lockfile.go`

```go
package gitgo

import (
    "errors"
    "log"
    "os"
    "sync"
)

var (
    ErrMissingParent = errors.New("Missing Parent")
    ErrNoPermission = errors.New("No Permission")
    ErrStaleLock = errors.New("Stale Lock")
)

type lockFile struct {
    FilePath string
    LockPath string
    Lock     *os.File
    mu       sync.Mutex
}

func lockInitialize(path string) *lockFile {
    lockpath := path + ".lock"
    return &lockFile{
        FilePath: path,
        LockPath: lockpath,
    }
}

func (l *lockFile) holdForUpdate() (bool, error) {
    l.mu.Lock()
    defer l.mu.Unlock()
    if l.Lock != nil {
        return true, nil // lock already aquired
    }

    file, err := os.OpenFile(l.LockPath, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0644)
    if err != nil {
        if os.IsExist(err) {
            return false, nil
        } else if os.IsNotExist(err) {
            return false, ErrMissingParent
        } else if os.IsPermission(err) {
            return false, ErrNoPermission
        }
        return false, err
    }

    l.lock = file
    return true, nil
}

func (l *lockFile) write(data []byte) {
    l.mu.Lock()
    defer l.mu.Unlock()

    l.errOnStaleLock()
    _, err := l.Lock.Write(data)
    if err != nil {
        log.Fatalf("Write error: %s\n", err)
    }
}

func (l *lockFile) commit() {
    l.mu.Lock()
    defer l.mu.Unlock()

    l.errOnStaleLock()

    err := l.Lock.Close()
    if err != nil {
        log.Fatalf("Err closing file: %s\n", err)
    }

    err = os.Rename(l.LockPath, l.FilePath)
    if err != nil {
        log.Fatalf("Err renaming file: %s\n", err)
    }

    l.Lock = nil
}

func (l *lockFile) errOnStaleLock() {
    if l.Lock == nil {
        log.Fatalf("Err: %s\nNot holding lock of file: %s\n", ErrStaleLock, l.LockPath)
    }
}
```

The purpose of the `holdForUpdate` function is to let the caller attemp to acquire a lock for writing to the file,
and to be told whether they were successful. This is done by attempting to open the `.lock` file with the `CREATE` and
`EXCL` flags, which means the file will be created if it does not exist, and an error will result if it already exists.

If the `OpenFile` call succeeds, then we store the file handle in the `lockFile.Lock` and return `true`. If the file
already exists, we return the error.

After aquiring the lock we need two further methods `write` and `commit`. The write method builds up data to be written
to the original file, by writing to the file with `.lock`. Then after the writing will be done, the `commit` function
will rename the file to the original file name, and will update the `lockFile.Lock` to null, so that no more data can
be written. Both of these function will stop when `lockFile.Lock` does not exists, since that indicates either that the
lock has been released, or that the caller never acquired it in the first place.

Now we can use this in the `ref.UpdateHead()` function, to prevent the two instances of `gitgo` to move the
`.gitgo/HEAD` at the same time.

`refs.go`

```go
import (
    // ...
    "errors"
    "fmt"
)

var ErrLockDenied = errors.New("Lock Denied")

// ...

func (r ref) UpdateHead(oid []byte) error {
    lockfile := lockInitialize(r.headPath)
    if lock, _ := lockfile.holdForUpdate(); !lock {
        return fmt.Errorf("Err: %s\nCould not aquire lock on file: %s", ErrLockDenied, r.headPath)
    }

    oid = append(oid, '\n')
    lockfile.write(oid)
    lockfile.commit()

    return nil
}
```

This modification to `refs.go` ensures that the chain of commits is properly recorded, since it prevents `.gitgo/HEAD`
from being inconsistenlty updated. The `lockfile` abstraction will find further use later, as we introduce more types
of record-keeping into the repository.

#### Don't overwrite objects

Before move to the next feature, there's a small improvement we need to make. When we first wrote the `cmdHandler`
we were writing all the objects whether `commit`, `tree` or `commit` object to disk.

Now on the every subsequent commit, there will be files that will be unchanged, particularly `blob` object. It's
wasteful to re-write these files, so we'd like to avoid
it if possible.

`database.go`

```go
func StoreObject(data bytes.Buffer,
    prefix, folderPath, PermPath string
) error {
    err := os.MkdirAll(folderPath, 0755)
    if err != nil {
        return err
    }

    // if the file exists exit
    _, err = os.Stat(PermPath)
    if os.IsExist(err) {
        return nil
    }

    // ...
}
```

Now we are skipping the files that already exists on the disk.

## Afterwords

And voila... there we have it. In this part we created

- A link to the past, meaning storing the previous commits
  hash to the subsequent commits as the `parent` field.

- Safely updating the `.gitgo/HEAD` file.

- Not overwriting the `blob` object to the disk.

Great work...

Code Link: [Github](https://github.com/Vikuuu/gitgo)

Just know this,

> Reinvent the wheel, so that you can learn how to invent wheel
>
> -– a nobody
