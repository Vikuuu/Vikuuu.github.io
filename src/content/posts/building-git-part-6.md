---
title: "Building Git: part VI"
pubDate: 2025-06-07
description: ""
ogImage: "https://sunguoqi.com/me.png"
author: ""
image:
  url: "https://docs.astro.build/assets/rose.webp"
  alt: "The Astro logo on a dark background with a pink glow."
tags: []
---
## Building Git: Part VI

![Git part VI](../../assets/git-part-6.png)

What's up everyone, what interesting projects are you guys working on, do tell me.
In our previous part we updated our code to make use of `add` command to store the desired files
in the _staging area_(a.k.a `index` file), and then update the `commit` command to commit only those
files that are present in our _staging area_. But there are some problem with our current implementation.
That is when we call our `add` command it overwrites all the files that are already present in the
`index` file and starts from new blank state. This is not helpfull at all, imagine you added some files
to the staging area, and after that also edited some other files and then added them to the staging area
and commited the staging files, but to your surprise only the files that you added using the second `add` command that you used.
Not good right.

#### Incremental addition

So in this part we will be updating our `add` command so that it can add the files to the `index` or in the `staging` area.
We want to support the incremental update support, i.e. we want to use multiple `add` commands to update our
staging area. And come let's do that.

##### Parsing the `.git/index`

Firstly, we will update our handler function to not create a new instance of
`index` but call a function `IndexHoldForUpdate` that will create a new `index` instance for
us and will load the `index` file that might be present in the `.gitgo` directory.

`cmd/gitgo/cmdHandler.go`

```diff
func cmdAddHandler(args []string) error {
-   index := gitgo.NewIndex()
+   _, index := gitgo.IndexHoldForUpdate()
    for _, path := range args {
        // ...
}
```

We will update our `Index` struct to store a new _changed_ flag. It will help us
in keep the track we changed the `index` file has been modified since loading it.

`index.go`

```go
type Index struct {
    // ...
    changed bool
}

func NewIndex() *Index {
    return &Index {
        // ...
        changed: false,
    }
}
```

```go
func IndexHoldForUpdate() (bool, *Index) {
    index := NewIndex()
    b, err := index.lockfile.holdForUpdate()
    if err != nil {
        return false, nil
    }
    if !b {
        return false, nil
    }

    err = index.Load()
    return true, index
}
```

We will get the lock in this function so that we do not have to get the lock
for any further calls.

Now we will have to open the `index` file that might be present in the `.gitgo` directory.

```go
func (i *Index) load() error {
    fileReader, err := os.Open(filepath.Join(GITPATH, "index"))
    if err != nil {
        return err
    }
    defer fileReader.Close()
    hash := new(bytes.Buffer)
    count := i.readHeader(fileReader, hash)
    i.readEntries(fileReader, count, hash)
    verifyChecksum(fileReader, hash)

    return nil
}
```

First we open the file, create a new hash variable, read the header and get the
count of the entries that might be present in the `index` file and lastly we will verify the checksum.

```go
const(
    HEADERSIZE   = 12
    HEADERFORMAT = "a4N2"
    SIGNATURE    = "DIRC"
    VERSION      = 2
)


func (i *Index) readHeader(f *os.File, h *bytes.Buffer) int {
    data, err := read(f, HEADERSIZE)
    if err != nil {
        log.Fatalf("%s\n", err)
    }
    signature, version, count := data[:4], data[4:8], data[8:12]
    if string(signature) != SIGNATURE {
        log.Fatalf("signature: expected %s got %s\n", SIGNATURE, signature)
    }
    if binary.BigEndian.Uint32(version) != VERSION {
        log.Fatalf("version: expected %d got %d\n", binary.BigEndian.Uint32(version), VERSION)
    }

    h.Write(data)
    return int(binary.BigEndian.Uint32(count))
}
```

Here we read the file, and then get the signature, version, and count of the entries
by splicing the `data` `[]byte`.
We know that signature, version, and count all of these three occupy the
4 byte in the index file. Then we verify that signature and version are what
we expect them to be. If they are then we write that data into our `[]byte` slice named hash we created in the `load` method.

```go
func read(f io.Reader, size int, h *bytes.Buffer) ([]byte, error) {
    data := make([]byte, size)
    _, err := f.Read(data)
    if err != nil {
        return nil, err
    }

    return data, nil
}
```

Now we will create the `readEntries`.

```go
func (i *Index) readEntries(r io.Reader, count int, h *bytes.Buffer) {
    for range count {
        entry, err := read(r, ENTRYMINSIZE)
        if err != nil {
            log.Fatalln(err)
        }

        for entry[len(entry)-1] != byte(0) {
            e, err := read(r, ENTRYBLOCK)
            if err != nil {
                log.Fatalln(err)
            }

            entry = append(entry, e)
        }

        i.storeEntryByte(entry)
        _, err := h.Write(entry)
        if err != nil {
            log.Fatalf("err writing entry to hash: %s\n")
        }
    }
}
```

First, we read the data for `ENTRYMINSIZE` count, if we do not find the
nil byte in that block, then we again read the next **8** bytes, until we find the nil byte.
And store it in our `Index` and write it in our `hash` byte slice.

```go
func verifyChecksum(f io.Reader, h *bytes.Buffer) {
    checksum := make([]byte, 20)
    c := bytes.NewBuffer(checksum)
    _, err := f.Read(c.AvailableBuffer())
    if err != nil {
        log.Fatalln(err)
    }

    currChecksum := sha1.Sum(h.Bytes())
    currC := bytes.NewBuffer(currChecksum[:])

    if bytes.Equal(c.Bytes(), currC.Bytes()) {
        log.Fatalln("checksums not equal")
    }
}
```

You guys can, give better variable name then me, I am just going with the flow.
We read the remaining data in the file, that will hopefully only be the `SHA1` hash of the index file.
We are just checking for the equality here.

Now let's create the `storeEntryByte` function that we used in our `readEntries` function.
We read the bytes of the entries and now we want to **deserialize** them to the `IndexEntry` struct.

```go
func (i *Index) storeEntryByte(entry []byte) {
    fNameInEntry := entry[62:]
    oidInEntry := entry[40:60]
    nullIdx := bytes.IndexByte(fNameInEntry, byte(0))

    fileName := ""
    if nullIdx != -1 {
        fileName = string(fNameInEntry[:nullIdx])
    } else {
        fileName = string(fNameInEntry[:])
    }

    stat, err := os.Stat(fileName)
    if err != nil {
        log.Fatalln(err)
    }

    i.Add(fileName, hex.EncodeToString(oidInEntry), stat)
}
```

We add them in the `Index`, and set the `changed` flag to `true`.

```go
func (i *Index) Add(path, oid string, stat os.FileInfor) {
    entry := NewIndexEntry(path, oid, stat)
    i.storeEntry(entry)
    i.changed = true
}
```

Update the changed flag, tells us that we made the changes in the `index` file and should commit those changes in the
file.

```go
func (i *Index) storeEntry(e *IndexEntry) {
    i.keys.Add(e.Path)
    i.entries[e.Path] = *e
}
```

This is easy we are just storing the `Entries` in our `Index` structure.

##### Storing Updates

Let's update update our index writing function.

`index.go`

```diff
func (i *Index) WriteUpdate() (bool, error) {
-	b, err := i.lockfile.holdForUpdate()
-	if err != nil {
-		return false, err
-	}
-	if !b {
-		return false, nil
-	}
+	if !i.changed {
+		return false, i.lockfile.rollback()
+	}
+
	buf := new(bytes.Buffer) // makes a new buffer and returns its pointer

    // ...

    i.lockfile.commit()
+   i.changed = false
    return true, nil

```

This checks if the `changed` flag is not _true_, then we will rollback any changes we made.

`locfile.go`

```go
func (l *lockFile) rollback() error {
    l.mu.Lock()
    defer l.mu.Unlock()

    err := os.Remove(l.LockPath)
    if err != nil {
        return err
    }
    l.Lock = nil
    return nil
}
```

We created the `rollback` function to rollback any changes we might have made upto that point.

#### Committing from Index

Now that we are can incrementally update our index file, now it's time to update our `commit` command to
commit the files that are in the `index` file.

`cmd/gitgo/cmdHandler.go`

```diff
func cmdCommitHandler(_ string) error {
-	rootPath := gitgo.ROOTPATH
-	// storing all the blobs first
-	entries, err := gitgo.StoreOnDisk(rootPath)
-	if err != nil {
-		return err
-	}
-	// build merkel tree, and store all the subdirectories tree file
+	index := gitgo.NewIndex()
+	index.Load()
+	tree := gitgo.BuildTree(index.Entries())
	e, err := gitgo.TraverseTree(tree)
    if err != nil {
        return err
    }

    // ...

+   // clear the file after the commit
+   err = os.Remove(filepath.Join(gitgo.GITPATH, "index"))
+   if err != nil {
+       return err
+   }
+
    return nil
}
```

Previously, we were building the tree from the whole files and directory in the root directory,
but now we do not have to do that, we should now only build tree from the files that are
provided to us in the index entry.

And after commit we are removing the `index` file so that all the `index` entries are removed.

We return the slice of `Entries` that is returned to us by `index.Entries` to our `BuildTree` function.

`index.go`

```go
func (i *Index) Entries() []Entries {
    e := []Entries{}

    it := i.keys.Iterator()
    for it.Next() {
        path := it.Key()
        entry := i.entries[path]
        e = append(e, Entries{
            Path: path,
            OID: entry.Oid,
            Stat: strconv.Itoa(entry.Mode),
        })
    }

    return e
}
```

The function is pretty much straight forward, our `key` value in the `Index` structure
uses the `SortedSet` that we
[implemented](https://vikuuu.github.io/implementing-sorted-set-in-go)
, and get traverse that set.

And, voilaa...

Now our `gitgo` can read from the `index` file to make a commit, how cool is that.

#### The problem

Well, our current implementation has a problem.

Let's suppose we added file called **file1.txt** in our `index` file using the add command.
And now we changed the **file1.txt** file to be a directory and added a new file in it like
**file1.txt/some.txt**, now if we again use the `add` command, we can save this new change just fine, we do not have the problem
there, but we want to update our file structure in the index file.

If you check your index file, you can see both the entries for the **file1.txt** and **file1.txt/some.txt**,
we do not want that to happen. We want our index structure to remain consistent with the
repository structure.

This can be true for the vice-versa of this condition, that a folder has been changed to the
file.

But before go about updating the code to correct this error, we should do something else.

##### Test suites

Yes, till now we were not writing the test, not because I do not know how to write test, but
because [book](url) never instructed me to do so. And know it did.

First let's write a test case for adding a file to the index.

`index_test.go`

```go
package gitgo

import (
    "crypto/rand"
    "encoding/hex"
    "os"
    "runtime"
    "testing"

	"github.com/stretchr/testify/assert"
)

// for testing purpose any random oid will do
func randomOID() string {
    b := make([]byte, 20)
    if _, err := rand.Read(b); err != nil {
        panic("failed to read random bytes: " + err)
    }

    return hex.EncodeToString(b)
}

// for testing purpose we will get the stats of this
// test file
func thisFileStat(t *testing.T) os.FileInfo {
    // locate this test file
    _, thisFile, _, ok := runtime.Caller(0)
    if !ok {
        t.Fatal("could not get current test filename")
    }
    fi, err := os.Stat(thisFile)
    if err != nil {
        t.Fatalf("stat test file: %v", err)
    }

    return fi
}

func TestAddSingleFile(t *testing.T) {
    // create a temp dir for this test and act the
    // repo root dir
    tmpDir := t.TempDir()
    ROOTPATH = tmpDir

    idx := NewIndex()
    oid := randomOID()
    stat := thisFileStat(t)

    idx.Add("alice.txt", oid, stat)

    entries := idx.Entires()

    var got []string
    for _, e := range entries {
        got = append(got, e.Path)
    }

    expected := []string{"alice.txt"}
    assert.Equal(t, expected, got)
}
```

I'm making use of the `testify` package, for asserts in testing, rather using the `go`'s _table-driven tests_
because I like this way.

Run the test and it should pass(fingers crossed).

##### Replacing file with directory

Now let's write the test case for the problem we described earlier.

`index_test.go`

```go
func TestReplaceFileWithDir(t *testing.T) {
    index := NewIndex()

    index.Add("alice.txt", randomOID(), thisFileStat(t))
    index.Add("bob.txt", randomOID(), thisFileStat(t))

    index.Add("alice.txt/nested.txt", randomOID(), thisFileStat(t))

    expected := []string{"alice.txt/nested.txt", "bob.txt"}
    var got []string
    it := index.keys.Iterator()
    for it.Next() {
        got = append(got, it.Key())
    }

    assert.Equal(t, expected, got)
}
```

This test case should fail, because we did not have any mechanism in place to correct this bug. You can call that we are
now doing table driven development(TDD) (uncle bob will be happy with our progress).

`index.go`

```go
func (i *Index) Add(path, oid string, stat os.FileInfo) {
    entry := NewIndexEntry(path, oid, stat)
+   i.discardConflict(entry)
    i.storeEntry(entry)
    i.changed = true
}
```

```go
func (i *Index) discardConflict(e *IndexEntry) {
    var dirPaths []string
    d := filepath.Dir(e.Path)
    dirPaths = append(dirPaths, d)
    for d != "." && d != ".." && d != string(filepath.Separator) {
        d = filepath.Dir(d)
        dirPaths = append(dirPaths, d)
    }

    // Remove files if they are now changed to dir
    for _, dirPath := range dirPaths {
        i.keys.Remove(dirPath)
        delete(i.entries, dirPath)
    }
}
```

Now run the test and it should pass.

That's one problem fixed.

##### Replace directory with file

Let's write a test case for vice-versa case of the problem we just solved above.

`index_test.go`

```go
func TestReplaceDirWithFile(t *testing.T) {
    index := NewIndex()

    index.Add("alice.txt", randomOID(), thisFileStat(t))
    index.Add("nested/bob.txt", randomOID(), thisFileStat(t))
    index.Add("nested", randomOID(), thisFileStat(t))

	expected := []string{"alice.txt", "nested"}
	var got []string
	it := index.keys.Iterator()
	for it.Next() {
		got = append(got, it.Key())
	}

	assert.Equal(t, expected, got)
}

func TestReplaceNestedDirWithFile(t *testing.T) {
	index := NewIndex()

	index.Add("alice.txt", randomOID(), thisFileStat(t))
	index.Add("nested/bob.txt", randomOID(), thisFileStat(t))
	index.Add("nested/inner/claire.txt", randomOID(), thisFileStat(t))
	index.Add("nested", randomOID(), thisFileStat(t))

	expected := []string{"alice.txt", "nested"}
	var got []string
	it := index.keys.Iterator()
	for it.Next() {
		got = append(got, it.Key())
	}

	assert.Equal(t, expected, got)
}
```

In this case, we have a dir `nested` that has a file `bob.txt` but in the next `add` command,
we changed the structure and `nested` became a file. And same for the `nested` with the nested files.

To update our code to correct this, thing we will have to change our `Index` struct.
Currently, we storing things like this

```go
index.keys = SortedSet([
    "alice.txt",
    "nested/bob.txt",
    "nexted/inner/claire.txt",
])

index.entries = {
    "alice.txt"               => Entries{}
    "nested/bob.txt"          => Entries{}
    "nexted/inner/claire.txt" => Entries{}
}
```

To remove the nested directories, we will have to traverse all the parents of the file and check
if any change in the structure happened for all the files, let's not do that.

We will use a new parameter `parents` in our `index` structure that will be the `map` of `map[string]Set` that will store
the directory as key and all its inner files in a `Set`.

Well, we do not have the `Set` in go, so let's create one.

`internal/datastr/set.go`

```go
package datastr

import (
    "iter"
    "slices"
)

type Set struct {
    arr []string
}

func NewSet() *Set {
    return &Set{}
}

// Add value in the slice if not found
func (s *Set) Add(val string) {
    found := slices.Contains(s.arr, val)
    if found {
        return
    }
    s.arr = append(s.arr, val)
}

// Remove value if found
func (s *Set) Remove(val string) {
    found := slices.Contains(s.arr, val)
    if !found {
        return
    }
    idx := slices.Index(s.arr, val)
    s.arr = slices.Delete(s.arr, idx, idx)
}

// Return the iterator on the set
func (s *Set) All() iter.Seq2[int, string] {
    return slices.All(s.arr)
}

func (s *Set) GetAll() []string {
    return s.arr
}

func (s *Set) IsEmpty() bool {
    return len(s.arr) == 0
}
```

Simple right...?

`index.go`

```go
type Index struct {
	entries  map[string]IndexEntry
	keys     *datastr.SortedSet
	lockfile *lockFile
	changed  bool
+	parents  map[string]*datastr.Set
}

func NewIndex() *Index {
	return &Index{
		entries:  make(map[string]IndexEntry),
		keys:     datastr.NewSortedSet(),
		lockfile: lockInitialize(filepath.Join(GITPATH, "index")),
		changed:  false,
+		parents:  make(map[string]*datastr.Set),
	}
}
```

Now we store an entry, we iterator over its parent directories and add the entry's path to each directories set in
`index.parent`

```go
func (i *Index) storeEntry(e *IndexEntry) {
    i.keys.Add(e.Path)
    i.entries[e.Path] = *e

    var parents []string
    p := filepath.Dir(e.Path)
    parents = append(parents, p)

    for p != "." && p != ".." && p != string(filepath.Separator) {
        p = filepath.Dir(p)
        parents = append(parents, p)
    }

    for _, p := range parents {
        pSet, ok := i.parents[p]
        if !ok {
            pSet = datastr.NewSet()
            i.parents[p] = pSet
        }
        pSet.Add(e.Path)
    }
}
```

With the parents added we can now extend our `discardConflict` function to remove the directories that conflict
with the file.

```go
func (i *Index) discardConflict(e *IndexEntry) {

+   // Remove dirs if they are now changed to file
+   i.removeChildren(e.Path)
}
```

```go
func (i *Index) removeChildren(p string) {
    pSet, ok := i.parents[p]
    if !ok {
        return
    }
    original := pSet.GetAll()
    children := make([]string, len(original))
    copy(children, original)
    for _, child := range children {
        i.removeEntry(child)
    }
}

func (i *Index) removeEntry(path string) {
    entry, ok := i.entries[path]
    if !ok {
        return
    }
    i.keys.Remove(entry.Path)
    delete(i.entries, entry.Path)

    var dirPaths []string
    d := filepath.Dir(path)
    dirPaths = append(dirPaths, d)
    for d != "." && d != ".." && d != string(filepath.Separator) {
        d = filepath.Dir(d)
        dirPaths = append(dirPaths, d)
    }

    for _, d := range dirPaths {
        dir := d
        i.parents[dir].Remove(entry.Path)
        if i.parents[dir].IsEmpty() {
            delete(i.parents, dir)
        }
    }
}
```

Woooohhhh, with this we are now done, with the current updates, now run the tests and we should pass all the test cases.
I am passing all my test cases.

#### Handling Bad inputs

Our current implementation of the `add` command works very great, but under an assumption that our user is intelligent
and will always provide us with the correct file or directory input. Alas, that is not always the case. The user might
accidently provide the wrong filename or a filename that might not even exists in the repository.

##### Handling non-existent file

Now, we want to handle the bad input that our user might throw at us.
Let's see how, git handles this?

```bash
mkdir gitgo-test && cd gitgo-test
touch main.go
git init
```

Now we will add the `main.go` file and another file that does not exists in the repository.

```bash
❯ git add main.go no-such-file
fatal: pathspec 'no-such-file' did not match any files
```

We get a `fatal` error telling us that the file does not exists.
And if you try to check the `index` file, it does not exists, the `git` did not added any file what so ever if one such
file do not exists.

```bash
❯ cat .git/index
cat: .git/index: No such file or directory
```

So, for replicating that we will have to update our `cmdAddHandler` first to add all the files in a _slice_ using the
`ListFiles` function, we want this function to return an **error** if the file do not exists in the actual repository.
If it returns the _error_ we will then exit the function early and return the _error_ indicating **failure**. If error
does not occur in the `ListFiles` function that we can iterate over the _slice_ in which we added all the file paths and
do the normal thing that we were doing.

In our `cmdAddHandler` function we will have to update the _iteration_ block, as we did in the code snippet below.

`cmd/gitgo/cmdHandler.go`

```diff
// @@ -112,39 +112,46 @@ func cmdCatFileHandler(hash string) error {
 func cmdAddHandler(args []string) error {
 	// index := gitgo.NewIndex()
 	_, index := gitgo.IndexHoldForUpdate()
+	var filePaths []string
+
+	// add all the paths to a slice first
 	for _, path := range args {
 		absPath, err := filepath.Abs(path)
 		if err != nil {
 			return err
 		}
 		expandPaths, err := gitgo.ListFiles(absPath)
+		if err != nil {
+			index.Release()
+			return err
+		}
+		filePaths = append(filePaths, expandPaths...)
+	}
+
+	for _, p := range filePaths {
+		ap, err := filepath.Abs(p)
+		if err != nil {
+			return err
+		}
+
+		data, err := os.ReadFile(ap)
 		if err != nil {
 			return err
 		}
-		for _, p := range expandPaths {
-			ap, err := filepath.Abs(p)
-			if err != nil {
-				return err
-			}
-
-			data, err := os.ReadFile(ap)
-			if err != nil {
-				return err
-			}
-			stat, err := os.Stat(ap)
-			if err != nil {
-				return err
-			}
-
-			blob := gitgo.Blob{Data: data}.Init()
-			hash, err := blob.Store()
-			if err != nil {
-				return err
-			}
-
-			index.Add(p, hash, stat)
+		stat, err := os.Stat(ap)
+		if err != nil {
+			return err
 		}
+
+		blob := gitgo.Blob{Data: data}.Init()
+		hash, err := blob.Store()
+		if err != nil {
+			return err
+		}
+
+		index.Add(p, hash, stat)
 	}
+
 	res, err := index.WriteUpdate()
 	if err != nil {
 		return err

```

In our `ListFiles` function we are just now checking if our **syscall** to the `Stat` on the file or directory name
returned any error, if it did that would possibly means(not neccessarily) that the file is not present in the actual
repository.

`files.go`

```go
// @@ -1,12 +1,15 @@
 package gitgo

 import (
+	"errors"
 	"fmt"
 	"io/fs"
 	"os"
 	"path/filepath"
 )

+var ErrMissingFile = errors.New("no file with the name")
+
 // Returns the flatten directory structure
 func ListFiles(dir string) ([]string, error) {
 	var workfiles []string
// @@ -18,6 +21,10 @@ func ListFiles(dir string) ([]string, error) {

 		// check if the given dir string is file or dir ?
 		s, err := os.Stat(path)
+		// if file is not present
+		if os.IsNotExist(err) {
+			return fmt.Errorf("%w '%s'", ErrMissingFile, dir)
+		}
 		if !s.IsDir() {
 			relPath, err := filepath.Rel(dir, path)
 			if err != nil {
```

Now, if we encounter the above mentioned error, we want to release the **lock** that we have on the `index` file so that
when the next instance of the `gitgo` runs it does not file `index.lock` file.

`index.go`

```go
// @@ -423,3 +423,5 @@ func writeIndexEntry(entry IndexEntry) ([]byte, error) {
 	}
 	return b.Bytes(), nil
 }
+
+func (i *Index) Release() error { return i.lockfile.rollback() }
```

Easy.

##### Unreadable File

Now, there might happen that the reader have given us a filename, that we cannot read(i.e. we do not have the appropriate
permission to do so). Let's see what happens in the `git` when we do this.

```bash
❯ chmod -r main.go
❯ git add main.go
error: open("main.go"): Permission denied
error: unable to index file 'main.go'
fatal: adding files failed
```

I changed the permission our file by removing the reading permission and as we can see we cannot use the _syscall_
**open** because we do that have the permission to do so. The `git` reported that error.

`cmd/gitgo/cmdHandler.go`

```diff
// @@ -136,6 +136,9 @@ func cmdAddHandler(args []string) error {

 		data, err := os.ReadFile(ap)
 		if err != nil {
+			if os.IsPermission(err) {
+				return fmt.Errorf("%w '%s'\nFatal: adding files failed", os.ErrPermission, p)
+			}
 			return err
 		}
 		stat, err := os.Stat(ap)
```

In our case the fix is very easy for us, we just want to give a better error message to our user.

##### Locked Index file

We can trigger the `git`'s error handler in case there is already a `.git/index.lock` file present.

```bash
❯ touch .git/index.lock
❯ git add main.go
fatal: Unable to create '/home/viku/Workspace/personal/go/tests/gitgo-test/.git/index.lock': File exists.

Another git process seems to be running in this repository, e.g.
an editor opened by 'git commit'. Please make sure all processes
are terminated then try again. If it still fails, a git process
may have crashed in this repository earlier:
remove the file manually to continue.
```

In the book, it said that the message `e.g an editor opened by git commit` is now not true for the git as while the git
opens the `commit` file at that time it does not have the lock for the `index` file. So we can just remove this example
message in our implementation.

Now in our `IndexHoldForUpdate` we want to return an error, if the file is already present.

`index.go`

```diff
// @@ -60,20 +60,20 @@ func (i *Index) Entries() []Entries {
 	return e
 }

-func IndexHoldForUpdate() (bool, *Index) {
+func IndexHoldForUpdate() (bool, *Index, error) {
 	index := NewIndex()
 	b, err := index.lockfile.holdForUpdate()
 	if err != nil {
-		return false, nil
+		return false, index, err
 	}
 	if !b {
-		return false, nil
+		return false, index, nil
 	}

 	// load the index file
 	err = index.Load()

-	return true, index
+	return true, index, nil
 }

 func (i *Index) Load() error {
```

In our _lockfile_ implementation we are now making a check in the error handling, if the file already exists(also I
have updated how I am checking for the errors).

`lockfile.go`

```diff
// @@ -5,6 +5,7 @@ import (
 	"log"
 	"os"
 	"sync"
+	"syscall"
 )

 var (
@@ -31,18 +32,23 @@ func lockInitialize(path string) *lockFile {
 func (l *lockFile) holdForUpdate() (bool, error) {
 	l.mu.Lock()
 	defer l.mu.Unlock()
+
 	if l.Lock != nil {
		return true, nil // lock already aquired
 	}

 	file, err := os.OpenFile(l.LockPath, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0644)
 	if err != nil {
-		if os.IsExist(err) {
-			return false, nil
-		} else if os.IsNotExist(err) {
-			return false, ErrMissingParent
-		} else if os.IsPermission(err) {
-			return false, ErrNoPermission
+		var pathErr *os.PathError
+		if errors.As(err, &pathErr) {
+			switch pathErr.Err {
+			case syscall.EEXIST:
+				return false, ErrLockDenied
+			case syscall.ENOENT:
+				return false, ErrMissingParent
+			case syscall.EACCES:
+				return false, ErrNoPermission
+			}
 		}
 		return false, err
 	}
```

Now we can update our `ref` file, to better reflect our update in the `lockfile`.

```diff
// @@ -2,7 +2,6 @@ package gitgo

 import (
 	"errors"
-	"fmt"
 	"os"
 	"path/filepath"
 )
@@ -23,8 +22,8 @@ func RefInitialize(pathname string) ref {
 func (r ref) UpdateHead(oid []byte) error {
 	lockfile := lockInitialize(r.headPath)

-	if lock, _ := lockfile.holdForUpdate(); !lock {
-		return fmt.Errorf("Err: %s\nCould not aquire lock on file: %s", ErrLockDenied, r.headPath)
+	if _, err := lockfile.holdForUpdate(); err != nil {
+		return err
 	}

 	oid = append(oid, '\n')
```

And lastly the `cmdAddHandler`, we are now returning a better error message.

`cmd/gitgo/cmdHandler.go`

```diff
// @@ -111,7 +111,16 @@ func cmdCatFileHandler(hash string) error {

 func cmdAddHandler(args []string) error {
 	// index := gitgo.NewIndex()
-	_, index := gitgo.IndexHoldForUpdate()
+	_, index, err := gitgo.IndexHoldForUpdate()
+	if err != nil {
+		return fmt.Errorf(`
+Fatal: %w
+
+Another gitgo process seems to be running in this repository.
+Please make sure all processes are terminated then try again.
+If it still fails, a gitgo process may have crashed in this
+repository earlier: remove the file manually to continue.`, err)
+	}
 	var filePaths []string

 	// add all the paths to a slice first
```

And now we are done with the implementation of the **git's** `add` command.

## Afterword

In this blog, we updated our `add` command to do the following

- Parsing the `index` file.
- Add the files in the incremental manner.
- Commit from the index file.
- Handling the bad input.

Code Link: [Github](https://github.com/Vikuuu/gitgo)

Just know this,

> Reinvent the wheel, so that you can learn how to invent wheel
>
> -- a nobody
