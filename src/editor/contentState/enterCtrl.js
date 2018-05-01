import selection from '../selection'

const enterCtrl = ContentState => {
  ContentState.prototype.chopBlockByCursor = function (block, key, offset) {
    const newBlock = this.createBlock('p')
    const children = block.children
    const index = children.findIndex(child => child.key === key)
    const activeLine = this.getBlock(key)
    const text = activeLine.text
    newBlock.children = children.splice(index + 1)
    children[index].nextSibling = null
    if (newBlock.children.length) {
      newBlock.children[0].preSibling = null
    }
    if (offset === 0) {
      this.removeBlock(activeLine, children)
      this.prependChild(newBlock, activeLine)
    } else if (offset < text.length) {
      activeLine.text = text.substring(0, offset)
      const newLine = this.createBlock('span', text.substring(offset))
      this.prependChild(newBlock, newLine)
    }
    return newBlock
  }

  ContentState.prototype.chopBlock = function (block) {
    const parent = this.getParent(block)
    const type = parent.type
    const container = this.createBlock(type)
    const index = this.findIndex(parent.children, block)
    const partChildren = parent.children.splice(index + 1)
    block.nextSibling = null
    partChildren.forEach(b => {
      this.appendChild(container, b)
    })
    this.insertAfter(container, parent)
    return container
  }

  ContentState.prototype.createRow = function (row) {
    const trBlock = this.createBlock('tr')
    const len = row.children.length
    let i
    for (i = 0; i < len; i++) {
      const tdBlock = this.createBlock('td')
      const preChild = row.children[i]
      tdBlock.column = i
      tdBlock.align = preChild.align
      this.appendChild(trBlock, tdBlock)
    }
    return trBlock
  }

  ContentState.prototype.createBlockLi = function (paragraphInListItem) {
    const liBlock = this.createBlock('li')
    if (!paragraphInListItem) {
      paragraphInListItem = this.createBlockP()
    }
    this.appendChild(liBlock, paragraphInListItem)
    return liBlock
  }

  ContentState.prototype.createTaskItemBlock = function (paragraphInListItem, checked = false) {
    const listItem = this.createBlock('li')
    const checkboxInListItem = this.createBlock('input')

    listItem.listItemType = 'task'
    checkboxInListItem.checked = checked

    if (!paragraphInListItem) {
      paragraphInListItem = this.createBlockP()
    }
    this.appendChild(listItem, checkboxInListItem)
    this.appendChild(listItem, paragraphInListItem)
    return listItem
  }

  ContentState.prototype.enterInEmptyParagraph = function (block) {
    if (block.type === 'span') block = this.getParent(block)
    const parent = this.getParent(block)
    let newBlock = null
    const needRenderBlocks = []
    const outMostBlock = this.findOutMostBlock(block)
    let containerOutBlock = null
    if (parent && (/ul|ol|blockquote/.test(parent.type))) {
      newBlock = this.createBlockP()
      if (this.isOnlyChild(block)) {
        if (outMostBlock !== parent) {
          needRenderBlocks.push(outMostBlock)
        }
        this.insertAfter(newBlock, parent)
        this.removeBlock(parent)
      } else if (this.isFirstChild(block)) {
        needRenderBlocks.push(outMostBlock)
        this.insertBefore(newBlock, parent)
      } else if (this.isLastChild(block)) {
        needRenderBlocks.push(outMostBlock)
        this.insertAfter(newBlock, parent)
      } else {
        const container = this.chopBlock(block)
        containerOutBlock = this.findOutMostBlock(container)
        needRenderBlocks.push(outMostBlock)
        this.insertAfter(newBlock, parent)
      }

      this.removeBlock(block)
    } else if (parent && parent.type === 'li') {
      if (parent.listItemType === 'task') {
        const { checked } = parent.children[0]
        newBlock = this.createTaskItemBlock(null, checked)
      } else {
        newBlock = this.createBlockLi()
        newBlock.listItemType = parent.listItemType
      }
      newBlock.isLooseListItem = parent.isLooseListItem
      this.insertAfter(newBlock, parent)
      const index = this.findIndex(parent.children, block)
      const blocksInListItem = parent.children.splice(index + 1)
      blocksInListItem.forEach(b => this.appendChild(newBlock, b))
      needRenderBlocks.push(outMostBlock)
      this.removeBlock(block)
    } else {
      newBlock = this.createBlockP()
      if (block.type === 'li') {
        this.insertAfter(newBlock, parent)
        this.removeBlock(block)
      } else {
        this.insertAfter(newBlock, block)
      }
      needRenderBlocks.push(outMostBlock)
    }
    const newBlockOutMost = this.findOutMostBlock(newBlock)
    needRenderBlocks.push(newBlockOutMost)
    // push order is important!
    if (containerOutBlock) needRenderBlocks.push(containerOutBlock)
    const { key } = newBlock
    const offset = 0
    this.cursor = {
      start: { key, offset },
      end: { key, offset }
    }
    return this.partialRender([...new Set(needRenderBlocks)])
  }

  ContentState.prototype.enterHandler = function (event) {
    const { start, end } = selection.getCursorRange()
    let block = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    let parent = this.getParent(block)
    const { floatBox } = this
    const { list, index, show } = floatBox

    // handle float box
    if (show) {
      event.preventDefault()
      floatBox.cb(list[index])
      const isUpdated = this.codeBlockUpdate(block)
      isUpdated && this.render()
      return
    }
    // handle cursor in code block
    if (block.type === 'pre') {
      return
    }

    event.preventDefault()

    // handle select multiple blocks
    // TODO: use partialRender
    if (start.key !== end.key) {
      const key = start.key
      const offset = start.offset

      const startRemainText = block.type === 'pre'
        ? block.text.substring(0, start.offset - 1)
        : block.text.substring(0, start.offset)

      const endRemainText = endBlock.type === 'pre'
        ? endBlock.text.substring(end.offset - 1)
        : endBlock.text.substring(end.offset)

      block.text = startRemainText + endRemainText

      this.removeBlocks(block, endBlock)
      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      this.render()
      return this.enterHandler(event)
    }

    // handle select multiple charactors
    if (start.key === end.key && start.offset !== end.offset) {
      const key = start.key
      const offset = start.offset
      block.text = block.text.substring(0, start.offset) + block.text.substring(end.offset)
      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      this.partialRender([ block ])
      return this.enterHandler(event)
    }

    // handle `shift + enter` insert `soft line break` or `hard line break`
    // only cursor in `line block` can create `soft line break` and `hard line break`
    if (event.shiftKey && block.type === 'span') {
      const { text } = block
      const newLineText = text.substring(start.offset)
      block.text = text.substring(0, start.offset)
      const newLine = this.createBlock('span', newLineText)
      this.insertAfter(newLine, block)
      const { key } = newLine
      const offset = 0
      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      return this.partialRender([ parent ])
    }

    // Insert `<br/>` in table cell if you want to open a new line.
    // Why not use `soft line break` or `hard line break` ?
    // Becasuse table cell only have one line.
    if (event.shiftKey && /th|td/.test(block.type)) {
      const { text, key } = block
      const brTag = '<br/>'
      block.text = text.substring(0, start.offset) + brTag + text.substring(start.offset)
      const offset = start.offset + brTag.length
      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      return this.partialRender([ block ])
    }

    // handle enter in table
    if (/th|td/.test(block.type)) {
      const row = this.getBlock(block.parent)
      const rowContainer = this.getBlock(row.parent)
      const table = this.getBlock(rowContainer.parent)

      if (event.metaKey) {
        const nextRow = this.createRow(row)
        if (rowContainer.type === 'thead') {
          const tBody = this.getBlock(rowContainer.nextSibling)
          this.insertBefore(nextRow, tBody.children[0])
        } else {
          this.insertAfter(nextRow, row)
        }
        table.row++
      }

      let nextBlock = this.findNextBlockInLocation(block)
      // if table(figure block) is the last block, create a new P block after table(figure block).
      if (!nextBlock) {
        const newBlock = this.createBlockP()
        this.insertAfter(newBlock, this.getParent(table))
        nextBlock = newBlock.children[0]
      }
      const key = nextBlock.key
      const offset = 0

      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      const tableOutMostBlock = this.findOutMostBlock(table)
      const cursorOutMostBlock = this.findOutMostBlock(nextBlock)
      const needRenderBlocks = [...new Set([tableOutMostBlock, cursorOutMostBlock])]
      return this.partialRender(needRenderBlocks)
    }

    if (block.type === 'span') {
      block = parent
      parent = this.getParent(block)
    }
    const paragraph = document.querySelector(`#${block.key}`)
    if (
      (parent && parent.type === 'li' && this.isOnlyChild(block)) ||
      (parent && parent.type === 'li' && parent.listItemType === 'task' && parent.children.length === 2) // one `input` and one `p`
    ) {
      block = parent
      parent = this.getParent(block)
    }
    const { left, right } = selection.getCaretOffsets(paragraph)
    const needRenderBlocks = []
    const outMostBlock = this.findOutMostBlock(block)
    needRenderBlocks.push(outMostBlock)
    const type = block.type
    let newBlock
    let tempBlock

    switch (true) {
      case left !== 0 && right !== 0: // cursor in the middle
        let { pre, post } = selection.chopHtmlByCursor(paragraph)

        if (/^h\d$/.test(block.type)) {
          const PREFIX = /^#+/.exec(pre)[0]
          post = `${PREFIX} ${post}`
          block.text = pre
          newBlock = this.createBlock(type, post)
        } else if (block.type === 'p') {
          newBlock = this.chopBlockByCursor(block, start.key, start.offset)
        } else if (type === 'li') {
          // handle task item
          if (block.listItemType === 'task') {
            const { checked } = block.children[0] // block.children[0] is input[type=checkbox]
            newBlock = this.chopBlockByCursor(block.children[1], start.key, start.offset)
            newBlock = this.createTaskItemBlock(newBlock, checked)
          } else {
            newBlock = this.chopBlockByCursor(block.children[0], start.key, start.offset)
            newBlock = this.createBlockLi(newBlock)
            newBlock.listItemType = block.listItemType
          }
          newBlock.isLooseListItem = block.isLooseListItem
        }
        this.insertAfter(newBlock, block)
        break
      case left === 0 && right === 0: // paragraph is empty
        return this.enterInEmptyParagraph(block)
      case left !== 0 && right === 0: // cursor at end of paragraph
      case left === 0 && right !== 0: // cursor at begin of paragraph
        if (type === 'li') {
          if (block.listItemType === 'task') {
            const { checked } = block.children[0]
            newBlock = this.createTaskItemBlock(null, checked)
          } else {
            newBlock = this.createBlockLi()
            newBlock.listItemType = block.listItemType
          }
          newBlock.isLooseListItem = block.isLooseListItem
        } else {
          newBlock = this.createBlockP()
        }

        if (left === 0 && right !== 0) {
          this.insertBefore(newBlock, block)
          tempBlock = newBlock
          newBlock = block
        } else {
          if (block.type === 'p') {
            const lastLine = block.children[block.children.length - 1]
            if (lastLine.text.trim() === '') {
              this.removeBlock(lastLine)
            }
          }
          this.insertAfter(newBlock, block)
        }
        break
      default:
        newBlock = this.createBlockP()
        this.insertAfter(newBlock, block)
        break
    }

    const outMostOfNewBlock = this.findOutMostBlock(newBlock)
    needRenderBlocks.push(outMostOfNewBlock)
    if (tempBlock) {
      needRenderBlocks.push(this.findOutMostBlock(tempBlock))
    }

    const getParagraphBlock = block => {
      if (block.type === 'li') {
        return block.listItemType === 'task' ? block.children[1] : block.children[0]
      } else {
        return block
      }
    }

    this.codeBlockUpdate(getParagraphBlock(newBlock))
    // If block is pre block when updated, need to focus it.
    const preParagraphBlock = getParagraphBlock(block)
    const blockNeedFocus = this.codeBlockUpdate(preParagraphBlock)
    let tableNeedFocus = this.tableBlockUpdate(preParagraphBlock)
    let htmlNeedFocus = this.updateHtmlBlock(preParagraphBlock)
    let cursorBlock

    switch (true) {
      case !!blockNeedFocus:
        cursorBlock = block
        break
      case !!tableNeedFocus:
        cursorBlock = tableNeedFocus
        break
      case !!htmlNeedFocus:
        cursorBlock = htmlNeedFocus
        break
      default:
        cursorBlock = newBlock
        break
    }

    cursorBlock = getParagraphBlock(cursorBlock)
    const key = cursorBlock.type === 'p' ? cursorBlock.children[0].key : cursorBlock.key
    const offset = 0
    this.cursor = {
      start: { key, offset },
      end: { key, offset }
    }
    this.partialRender([...new Set(needRenderBlocks)])
  }
}

export default enterCtrl
