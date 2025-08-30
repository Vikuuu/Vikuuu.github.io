---
title: "Understanding Linux File System"
pubDate: 2024-12-01
description: ""
author: "Guts Thakur" 
tags: ["linux", "file-system"]
---
## Introduction

![Understanding LFS](../../assets/linux-file-sys.png) 

So while working on the [Gobase](https://www.github.com/Vikuuu/gobase) project and working on the feature of the creation of migrations file and folder, researching for it throught online arcticles or official documentation, there was always the mention of a 4 digit number like "0777"( spoiler: do not use this in real world application). So to quench the curosity I searched for it what it means, and then i get to know that these are the numbers representing the permissions in the unix filesystem that is represented like this: 

**-rwxrw-r--**

### Lets understand the Linux File System:

When you do this in the terminal
```bash
ls -l filename.txt
```

output will come out like this:
```bash
-rw-r--r-- 12 viku viku 12.0k Apr 8 20:51 filename.txt
```

This is what above line meant:
```
-rw-r--r-- 12   viku    viku   12.0K  Apr 8 20:51 filename.txt
|[-][-][-]  - [------] [----]  [---]  [---------] [----------]
| |  |  |   |    |       |       |        |            |
| |  |  |   |    |       |       |        |            +--> 10. Name Of File
| |  |  |   |    |       |       |        +--------------->  9. Last Date Modified
| |  |  |   |    |       |       +------------------------>  8. Size Of File
| |  |  |   |    |       +-------------------------------->  7. Group
| |  |  |   |    +---------------------------------------->  6. Owner
| |  |  |   +--------------------------------------------->  5. Alternate Access Method/Hard Link
| |  |  +------------------------------------------------->  4. Others Permissions
| |  +---------------------------------------------------->  3. Group Permissions
| +------------------------------------------------------->  2. Owner Permissions
+--------------------------------------------------------->  1. File Type
```

1. **File Type**

There can be different types like, regular file(`-`), directory(`d`), or a [symbolic link](https://linuxize.com/post/how-to-create-symbolic-links-in-linux-using-the-ln-command/) or any other special type of file.

The following 9 characters represents the permissions for the owner, group and other of file respectively.

2. **File Permissions**

The 3 character represents the permission of the owner, group or other.

|ch | permission       | Number associated |
|---|------------------|-------------------|
|`r`| can read file    |   4               | 
|`w`| can write file   |   2               | 
|`x`| can execute file |   1               |  
|`-`| no permission    |   0               |  


> The permission digit of a specific user class is the sum of the values of the permissions for that class.
>
>-- [Linuxize](https://linuxize.com/post/what-does-chmod-777-mean/)

Each digit of the permission number may be a sum of 4,2,1, and 0:
- 0 (0 + 0 +0) - No permission
- 1 (0 + 0 +1) - Only execute permission
- 2 (0 + 2 +0) - Only write permission
- 3 (0 + 2 +1) - Write and execute permission
- 4 (4 + 0 +0) - Only Read permission
- 5 (4 + 0 +1) - Read and execute permission
- 6 (4 + 2 +0) - Read and write permission
- 7 (4 + 2 +1) - Read, write and execute permission

For instance a permission number is set to 750, then it corresponds to
- User can Read, write and execute file
- Group can Read and execute file
- Others have no permissions

When working in a programming language and adding the file perm to it always add the 0 leading the permission number for the user class.As this will tell the programming language that we are using the octal number (0-7), because the programming languages default to the decimal number(0-9),this can create problems while running the code. But if you are working in the bash itself then you can omit the leading 0, it will understand whatwe are trying to do, example: `chmod 777`.

3. **File Alternate Access/ Hard Links**

#### What is Hard link in Directory
A hard link is a pointer to the same inode on the filesystem. For directories, Hard links count the number of directory entries pointing to this directory's inode.

This include:
    - The directory itself(`.`).
    - The parent directory(`..`).
    - Any subdirectories within the directory.

The count will always be greater than or equals to 2. One for iteself, one for its parent directory, and each directory adds 1 more hard link because it is referenced in the subdirectories.

Example :- 

Consider the following directory structure.
```bash
/go
/go/subdir1
/go/subdir2
```

Running `ls -l` on `/go` might show:
```bash
drwxr-xr-x 4 viku viku 4096 Nov 28 21:57 go
```

4 hard links in this case are :-
 - `/go/.`
 - `/go/..`
 - `/go/subdir1`
 - `/go/subdir2`

#### What is Hard link for File
A hard link for a regular file, represents how many hard links exist pointing to the file's inode.

Example :-

Consider a file `example.txt`
```bash
-rw-r--r-- 2 viku viku 1024 Nov 28 22:30 example.txt
```

This `2` indicates that **2 hard links** exist to this file.

##### Creating and Counting Hard Links for Files:
1. Create a file:
```bash
echo "Hello, world!" > example.txt
```

2. Check hard link count(default is `1`):
```bash
ls -l example.txt
# -rw-r--r-- 1 viku viku 14 Nov 28 22:30 example.txt
```

3. Create a hard link:
```bash
ln example.txt linked_example.txt
```

4. Check hard link count again:
```bash
ls -l
# -rw-r--r-- 2 viku viku 14 Nov 28 22:30 example.txt
# -rw-r--r-- 2 viku viku 14 Nov 28 22:30 linked_example.txt
```

Both `example.txt` and `linked_example.txt` now point to the same inode.

#### Key Differences between Files and Directories
| Files | Directories | 
| ------------- | -------------- |
| Hard link count represents the number of filenames pointing to the same inode.| Hard link count represents the number of references to the directory(including `.` and `..` entries, and subdirectories).|
| Deleting a filename reduces the count but does not delete the file until the count reaches `0`. | Hard links for directories are restricted to avoid breaking the filesystem structur(e.g., causing loops). |

#### Why also calles Alternate Access Method
Hard links can be considered an **"alternate access method"** for the files because they provide multiple directory entries(filenames) pointing to the same underlying file(inode). Each hard link behaves like a separate file in the filesystem, but they all share the same inode and data.


## References

- [Linuxize](https://linuxize.com/post/what-does-chmod-777-mean/) 
- [StackExchange](https://unix.stackexchange.com/a/21252/680815)
- [GoSamples](https://gosamples.dev/create-directory/), this file peaked the interest in the file system.

**Key Mention**

- [ChatGPT](https://www.chatgpt.com)
