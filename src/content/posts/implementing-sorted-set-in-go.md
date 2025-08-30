---
title: "Implementing Sorted Set in Go"
pubDate: 2025-04-21
description: ""
ogImage: "https://sunguoqi.com/me.png"
author: ""
image:
  url: "https://docs.astro.build/assets/rose.webp"
  alt: "The Astro logo on a dark background with a pink glow."
tags: []
---
In this post, we will be implementing the **Sorted Set** data structure in _Go_. Why? well because while working on my
git project and following the book, the author used the ruby's sorted set in the code. So that's why I was also looking
for the sorted set, and thought why not build it myself, from scratch (ain't I building git for my toy project so why
not also this ;) )

### What is Sorted Set

I don't know ...
Well sorted set is set data-structure, that is ordered (usually in ascending) and enforces that all the elements that
are present in the set are unique.

Let's first decide on what data-structure our sorted set will be build upon? Redis has implemented its sorted set, using
two data-structures.

1. Hashmap (for O(1) lookup time)
2. Skip List (for O(log n) INSERT/REMOVE time)

In go we have hashmap(luckily...), as for skip list we will have to implement it.

### Implementing Skip List

So after knowing that first I will have to implement the skip list, I embarced on the journey of finding the tutorials,
videos understanding the skip list data-structure first. For understanding the skiplist I watched the [MIT Lecture](https://www.youtube.com/watch?v=kBwUoWpeH_Q)
on skip list.

Skip list is an easier alternative to the tree-type data-structures, that gives us the probabilitic(not deterministic,
meaning for most of the time) `O(log n)` time complexity for FINDING/INSERTING/REMOVING an element while maintaining
the desired order.
Skip list is built upon linked list, which just holds two value (i) the value itself, and (ii) the pointer to the next
node in the structure.
The difference comes in skip list is that it also have the **levels** added in this.

What skip list does, is it adds more linked list and adds them in level order, the lowest level has all the nodes,
the level above it will probabilistically have the half as much node and so on. So that when we start the top level,
search our element in that level, if we don't find the element in that level or found the greater value, we go a
level down till we find the value, if we do not found it, then it is not present in the skip list.

Let's first get the stucture in place.

`skiplist.go`

```go
package main

const (
    MaxHeight = 16
)

type node struct {
    key   []byte
    value []byte
    tower [MaxHeight]*node
}

type SkipList struct {
    head   *node
    height int
}
```

The _MaxHeight_ const tells the max height the skip list will have, this was used in the original paper
written by [William Pugh](https://dl.acm.org/doi/abs/10.1145/78973.78977), and it can store
65,536 nodes.

So our node has key, value pair and a tower helps in simulating the linked list stacking without
actually stacking the linked list, by using the pointer to the next node in that level.

Let's take an example

```bash
Level 3: head ▶ A ────────────────▶ nil
Level 2: head ▶ A ────────▶ D ────▶ nil
Level 1: head ────────▶ C ────▶ E ▶ nil
Level 0: head ▶ A ▶ B ▶ C ▶ D ▶ E ▶ nil
```

If we will see the tower array of the head node, in the tower[0], that is level 0 of skip list,
will have the pointer to the node A, then the tower[1], that is level 1 of skip list,
will have the pointer to the node C, and so on.
So without having to make multiple linked list data, we will have a single linked list.

Our _SkipList_ has two fields, `head` that is a sentinal node, that just acts as dummy node, helping
us in getting rid of many edge cases, and another field `height` tells the current height or levels of the skiplist.

Add a function that will return the pointer to the skiplist with initialized value.

```go
func NewSkipList() *SkipList {
    return &SkipList{
        head: &node{}, height: 1,
    }
}
```

#### Find

Now we want to implement the `Find` feature of the skip list, that will take the key and searches
the whole skiplist and if the key is found, returns its value otherwise based on your preference, return either a bool, error or anything else.

```go
func (s *SkipList) Find(key []byte) ([]byte, error) {
    found, _ := s.search(key)
    if found == nil {
        return nil, errors.New("key not found")
    }
    return found.value, nil
}
```

The `Find` API will use another unexported function that will do the actual searching in the skiplist.

The `search` function will return two things, firstly the node _pointer_ if we found it in the skiplist,
secondly the _journey_ array that tells what nodes was visited on what level, that will help in _INSERT/REMOVE_
node in skiplist. The _journey_ array will help in splicing, i.e. connecting and disconneting the node connections

```go
import (
    "bytes"
)

// ...


func (s *SkipList) search(key []byte) (*node, [MaxHeight]*node) {
    var next *node
    var journey [MaxHeight]*node

    prev := s.head
    for lvl := s.height - 1; lvl >= 0; lvl-- {
        for next = prev.tower[lvl]; next != nil; next = prev.tower[lvl] {
            if bytes.Compare(key, next.key) <= 0 {
                break
            }
            prev = next
        }
        journey[lvl] = prev
    }

    if next != nil && bytes.Equal(key, next.key) {
        return next, journey
    }
    return nil, journey
}
```

Now let's create the _ADD_ functionality, with the `search` in place, it won't we much difficult.

But wait before that, we need to get what height of what level the node we are inserting should be added to,
meaning should it only be added the level 0 or to more upper level?
To do so, we have two ways, firstly we can have a function `coinToss` that will simulate the tossing of coin.
If we get _HEAD_ we will bump the node a level, we will do so until we get _TAIL_. Suppose we added a node,
it will first be added to the level 0 (all nodes are required to be added in level 0), then we will
toss the coin, if we get the _TAIL_ on the first toss, we will stop there, so the inserted node will only remain in
the level 0.
Secondly, we can use a function that will generate a random number and then based on that number,
we will decide what top most level it will added. This is what we are going to use. It will tell us
the topmost level and we add the node pointer from the topmost level we got to the lowest level.

```go
import (
    "bytes"
    "math"
    _ "unsafe"
)

const (
    MaxHeight = 16
    PValue    = 0.5
)

var probabilities [MaxHeight]uint32

func init() {
    probability := 1.0
    for lvl := 0; lvl < MaxHeight; lvl++ {
        probabilities[lvl] = uint32(probability * float64(math.MaxUint32))
        probability *= PValue
    }
}

//go:linkname Uint32 runtime.fastrand
func Uint32() uint32

func randomHeight() int {
    seed := Uint32
    height := 1
    for height < MaxHeight && seed <=probabilities[height] {
        height++
    }
    return height
}
```

In this we are initializing the `probabilites` array (notice; array not slice), after that
we are populating it with the `uint32` values. The logic behind is that if in case we
`uint32` whose max value is `10`(for examples sake) we can have `2` probability of
`0-5` will occupy the level 1 and `5-10` will occupy the level 2, we can further divide
the `5-10`, so that `5-7` occupy the level 2 and `7-10` occupy the level 3, and so on.

The `init` function is called automatically by the _Go_ while compiling the package.

And the last function just creates the random number, this method is preferred over the
math.rand because this is more efficient [here](https://www.sobyte.net/post/2022-07/go-linkname/#2-golinkname-advanced-1-random-numbers).

#### Insert

Now let's add the `Insert` function that will insert the node at the desired sorted position.

```go
func (s *SkipList) Insert(key, val []byte) *node {
    found, journey := s.search(key)
    if found != nil {
        found.value = val
        return found
    }
    height := randomHeight()
    n := &node{key: key, value: val}

    for lvl := 0; lvl < height; lvl++ {
        prev = journey[lvl]
        if prev == nil {
            // the nil prev means the there was not this height
            // value in the skip list so this in the new height
            // so now the prev will be the head
            prev = s.head
        }
        n.tower[lvl] = prev.tower[lvl]
        prev.tower[lvl] = n
    }

    if height > s.height {
        s.height = height
    }
    return n
}
```

We are using the `search` to find the node, if present then overwrite the value with
the given value, here we can also return `error` depending on your use case. If node is not present, then
we will have the journey array that will tell us the appropriate neighbours where to splice the
node between.

#### Remove

Now let's remove the node, it will be same as to what we are doing.

```go
func (s *SkipList) Remove(key []byte) (bool, error) {
    found, journey := s.search(key)
    if found == nil {
        return false, fmt.Errorf("key not found")
    }

    for lvl := 0; lvl < s.heigth; lvl++ {
        if journey[lvl].tower[lvl] != found {
            break
        }
        journey[lvl].tower[lvl] = found.tower[lvl]
        found.tower[lvl] = nil
    }
    found = nil
    s.shrink()
    return true, nil
}
```

We are just splicing the nodes and connecting the correct node. As for the function `shrink`, it reduces the height of the
skip list if neccessary.

```go
func (s *SkipList) shrink() {
    for lvl := s.height - 1; lvl >= 0; lvl-- {
        if s.head.tower[lvl] == nil {
            s.height--
        }
    }
}
```

Guy's we are done with our implementation of skip list. But I would like to
add one more thing, Iterator.

#### Iterator

I want to create the iterator on the skip list, because in my `gitgo` project I want to
be able iterate on this underlying skip list, because the `tower` field in our `node` struct
is not exported(i.e. it starts with the lower-case letter) which good.

```go
type Iterator interface {
    Next() bool
    Key() string
}

type skipIterator struct {
    curr *node
}

func (it *skipIterator) Next() bool {
    next := it.curr.tower[0]
    if next == nil {
        return false
    }
    it.curr = next
    return true
}

func (it *skipIterator) Get() string {
    return string(it.curr.key)
}
```

### Implementing Sorted Set

Now let's create the focus of this blog, **Sorted Set**. We have already done the hard part, now its easy. Let's get the
structure in place.

```go
type SortedSet struct {
    hashmap map[string]*node
    list    *Skiplist
}
```

This is the design choice by **Redis**, it uses hashmap for `O(1)` lookup time, and `O(log n)` for FIND/INSERT/REMOVE
operations.

This is the whole code for the sorted set implementation.

```go
func NewSortedSet() *SortedSet {
    return &SortedSet{
        hashmap: make(map[string]*node),
        list: NewSkipList(),
    }
}

func (s *Sorted) Add(key string) {
    n := s.list.Insert([]byte(key), nil)
    s.hashmap[key] = n
}

func (s *SoretdSet) Remove(key string) bool {
    _, err := s.list.Delete([]byte(key))
    if err != nil {
        return false
    }
    delete(s.hashmap, key)
    return true
}

func (s *SortedSet) Contains(key string) (bool, *node) {
    if node, found := s.hashmap[key]; found {
        return true, node
    }
    return false, nil
}

func (s *SortedSet) Len() int { return len(s.hashmap) }

func (s *SortedSet) Iterator() Iterator {
    return &skipIterator{curr: s.list.head}
}
```

And voilaaa, we are done with our **Sorted Set** implementation.
In this we just abstracted the FIND/INSERT/DELETE and made the necessary
API exported, for users to use.

You can use the iterator like this:

```go
it := sortedset.Iterator()
for it.Next() {
    val := it.Get()
}
```

## References

- [Cloud Centric](https://www.cloudcentric.dev/implementing-a-skip-list-in-go/)
