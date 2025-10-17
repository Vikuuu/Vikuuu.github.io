---
title: "Building Git: part VII"
pubDate: 2025-09-30
description: "Implementing `status` command"
author: "Guts Thakur"
tags: ["git", "go", "system-tools"]
---

## Refactoring

First we will be refactoring, our code so that we can write tests for it, instead of doing the manual check. 
This will help with not breaking any existing functionality while adding new features.

We will be updating the `main.go`, to not use the `flag` library. We will create a function that will do that for us, more on that later.

File: `cmd/gitgo/main`

```diff
import (
-   "flag"
    "fmt"
    "os"
)

func main() {
-	init := flag.String("init", "", "Create .gitgo files in directory")
-	commit := flag.String("commit", "", "Commit file")
-	_ = flag.String("cat", "", "Cat the contents of stored files in objects dir")
-	// flag.Bool("help", false, "Help Message")
-	flag.Parse()
+	cmds := &commands{
+		registeredCmds: make(map[string]commandInfo),
+	}
+	cmds.initializeCommands()
-		flag.Usage()
-		return
+		fmt.Println("Usage: gitgo <command> [args...]")
+	}
+
+	cmdName := os.Args[1]
+	cmdArgs := os.Args[2:]
+
+	env := GetGitgoVar()
+
+	cmd := command{
+		name:   cmdName,
+		args:   cmdArgs,
+		env:    env,
+		pwd:    os.Getenv("PWD"),
+		stdin:  os.Stdin,
+		stdout: os.Stdout,
+		stderr: os.Stderr,
+		repo:   gitgo.NewRepository(os.Getenv("PWD")),
    }
-	// Initialize global vars
-	gitgo.InitGlobals()
-
-	switch os.Args[1] {
-	case "init":
-		err := cmdInitHandler(*init)
-		if err != nil {
-			fmt.Fprintf(os.Stderr, "Error: %s\n", err)
-			os.Exit(1)
-		}
-	case "commit":
-		err := cmdCommitHandler(*commit)
-		if err != nil {
-			fmt.Fprintf(os.Stderr, "Error: %s\n", err)
-			os.Exit(1)
-		}
-	case "add":
-		err := cmdAddHandler(os.Args[2:])
-		if err != nil {
-			fmt.Fprintf(os.Stderr, "Error: %s\n", err)
-			os.Exit(1)
-		}
-	case "cat":
-		fileHash := os.Args[2]
-		err := cmdCatFileHandler(fileHash)
-		if err != nil {
-			fmt.Fprintf(os.Stderr, "Error: %s\n", err)
-			os.Exit(1)
-		}
-	default:
-		flag.Usage()
+	exitCode, err := cmds.run(cmd)
+	if err != nil {
+		fmt.Fprintf(os.Stderr, "error: %v", err)
+		os.Exit(exitCode)
    }
}
```

So, from only this we can deduce that we are initializing all the command.
Then by reading the standard input, get the name, arguments, and give to the `command` struct.
Then we run the command.

File: `cmd/gitgo/main.go`

```go
func (c *commands) initializeCommands() {
	c.register("help", func(cmd command) int {
		handlerHelp(c, cmd)
		return 0
	}, "help", "Displays all available commands and their usage")

	c.register("commit", cmdCommitHandler, "commit", "Commits the files in staging area")
	c.register("init", cmdInitHandler, "init", "Initialize gitgo repository in the directory.")
	c.register("add", cmdAddHandler, "add", "Add files to staging area.")
	c.register("cat-file", cmdCatFileHandler, "cat-file", "Get the blob content.")
}

func GetGitgoVar() map[string]string {
	env := make(map[string]string)
	env["name"] = os.Getenv("GITGO_AUTHOR_NAME")
	env["email"] = os.Getenv("GITGO_AUTHOR_EMAIL")

	return env
}
```

Here we are initializing those commands that we have.

Now, for the command related thing.
We will be creating the `command` structure, that will work as [dependency injection](https://en.wikipedia.org/wiki/Dependency_injection).


File: `cmd/gitgo/command.go`

```go
package main

import (
	"errors"
	"os"

	"github.com/Vikuuu/gitgo"
)

type command struct {
	name   string
	pwd    string
	env    map[string]string
	args   []string
	stdin  *os.File
	stdout *os.File
	stderr *os.File
	repo   gitgo.Repository
}

type commandInfo struct {
	handler     func(command) int
	usage       string
	description string
}

type commands struct {
	registeredCmds map[string]commandInfo
}

func (c *commands) register(name string, handler func(command) int, usage, description string) {
	c.registeredCmds[name] = commandInfo{
		handler:     handler,
		usage:       usage,
		description: description,
	}
}

func (c *commands) run(cmd command) (int, error) {
	ci, ok := c.registeredCmds[cmd.name]
	if !ok {
		return 0, errors.New("command not found")
	}
	exitCode := ci.handler(cmd)
	return exitCode, nil
}
```

## Getting the `status` command
