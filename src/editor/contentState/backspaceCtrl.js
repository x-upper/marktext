import selection from '../selection'
import { findNearestParagraph, findOutMostParagraph } from '../utils/domManipulate'
import { isCursorAtBegin, onlyHaveOneLine, getEndPosition } from '../codeMirror'

const backspaceCtrl = ContentState => {
  ContentState.prototype.checkBackspaceCase = function () {
    const node = selection.getSelectionStart()
    const nearestParagraph = findNearestParagraph(node)
    const outMostParagraph = findOutMostParagraph(node)
    let block = this.getBlock(nearestParagraph.id)
    if (block.type === 'span') block = this.getParent(block)
    const preBlock = this.getPreSibling(block)
    const outBlock = this.findOutMostBlock(block)
    const parent = this.getParent(block)

    const { left: outLeft } = selection.getCaretOffsets(outMostParagraph)
    const { left: inLeft } = selection.getCaretOffsets(nearestParagraph)

    if (
      (parent && parent.type === 'li' && inLeft === 0 && this.isFirstChild(block)) ||
      (parent && parent.type === 'li' && inLeft === 0 && parent.listItemType === 'task' && preBlock.type === 'input') // handle task item
    ) {
      if (this.isOnlyChild(parent)) {
        /**
         * `<ul>
         *   <li>
         *     <p>|text</p>
         *     <p>maybe has other paragraph</p>
         *   </li>
         * <ul>`
         */
        return { type: 'LI', info: 'REPLACEMENT' }
      } else if (this.isFirstChild(parent)) {
        /**
         * `<ul>
         *   <li>
         *     <p>|text</p>
         *     <p>maybe has other paragraph</p>
         *   </li>
         *   <li>
         *     <p>other list item</p>
         *   </li>
         * <ul>`
         */
        return { type: 'LI', info: 'REMOVE_INSERT_BEFORE' }
      } else {
        /**
         * `<ul>
         *   <li>
         *     <p>other list item</p>
         *   </li>
         *   <li>
         *     <p>|text</p>
         *     <p>maybe has other paragraph</p>
         *   </li>
         *   <li>
         *     <p>other list item</p>
         *   </li>
         * <ul>`
         */
        return { type: 'LI', info: 'INSERT_PRE_LIST' }
      }
    }
    if (parent && parent.type === 'blockquote' && inLeft === 0) {
      if (this.isOnlyChild(block)) {
        return { type: 'BLOCKQUOTE', info: 'REPLACEMENT' }
      } else if (this.isFirstChild(block)) {
        return { type: 'BLOCKQUOTE', info: 'INSERT_BEFORE' }
      }
    }
    if (!outBlock.preSibling && outLeft === 0) {
      return { type: 'STOP' }
    }
  }

  ContentState.prototype.backspaceHandler = function (event) {
    const { start, end } = selection.getCursorRange()
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    // fix: #67 problem 1
    if (startBlock.icon) return event.preventDefault()
    // fix: unexpect remove all editor html. #67 problem 4
    if (startBlock.type === 'figure' && !startBlock.preSibling) {
      event.preventDefault()
      this.removeBlock(startBlock)
      if (start.key !== end.key) {
        this.removeBlocks(startBlock, endBlock)
      }
      let newBlock = this.findNextBlockInLocation(startBlock)
      if (!newBlock) {
        this.blocks = [this.createBlockP()]
        newBlock = this.blocks[0].children[0]
      }
      const key = newBlock.key
      const offset = 0

      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      return this.render()
    }

    if (start.key !== end.key) {
      event.preventDefault()
      const key = start.key
      const offset = start.offset
      const startRemainText = startBlock.type === 'pre'
        ? startBlock.text.substring(0, start.offset - 1)
        : startBlock.text.substring(0, start.offset)

      const endRemainText = endBlock.type === 'pre'
        ? endBlock.text.substring(end.offset - 1)
        : endBlock.text.substring(end.offset)

      if (offset === 0 && !(/th|td/.test(startBlock.type))) {
        if (startBlock.type === 'pre') {
          delete startBlock.coords
          delete startBlock.functionType
          delete startBlock.history
          delete startBlock.lang
          delete startBlock.pos
          this.codeBlocks.delete(key)
        }
        if (startBlock.type !== 'span') {
          startBlock.type = 'span'
          const pBlock = this.createBlock('p')
          this.insertBefore(pBlock, startBlock)
          this.removeBlock(startBlock)
          this.appendChild(pBlock, startBlock)
        }
      }
      startBlock.text = startRemainText + endRemainText

      this.removeBlocks(startBlock, endBlock)

      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      return this.render()
    }

    const node = selection.getSelectionStart()
    const paragraph = findNearestParagraph(node)
    const id = paragraph.id
    let block = this.getBlock(id)
    if (block.type === 'span') block = this.getParent(block)
    const parent = this.getBlock(block.parent)
    const preBlock = this.findPreBlockInLocation(block)
    const { left } = selection.getCaretOffsets(paragraph)
    const inlineDegrade = this.checkBackspaceCase()

    const tableHasContent = table => {
      const tHead = table.children[0]
      const tBody = table.children[1]
      const tHeadHasContent = tHead.children[0].children.some(th => th.text.trim())
      const tBodyHasContent = tBody.children.some(row => row.children.some(td => td.text.trim()))
      return tHeadHasContent || tBodyHasContent
    }

    if (block.type === 'pre') {
      const cm = this.codeBlocks.get(id)
      // if event.preventDefault(), you can not use backspace in language input.
      if (isCursorAtBegin(cm) && onlyHaveOneLine(cm)) {
        const anchorBlock = block.functionType === 'html' ? this.getParent(this.getParent(block)) : block
        event.preventDefault()
        const value = cm.getValue()
        const newBlock = this.createBlockP(value)
        this.insertBefore(newBlock, anchorBlock)
        this.removeBlock(anchorBlock)
        this.codeBlocks.delete(id)
        const key = newBlock.children[0].key
        const offset = 0

        this.cursor = {
          start: { key, offset },
          end: { key, offset }
        }
        const outMostBlock = this.findOutMostBlock(newBlock)
        this.partialRender([ outMostBlock ])
      }
    } else if (left === 0 && /th|td/.test(block.type)) {
      event.preventDefault()
      event.stopPropagation()
      const tHead = this.getBlock(parent.parent)
      const table = this.getBlock(tHead.parent)
      const figure = this.getBlock(table.parent)
      const hasContent = tableHasContent(table)
      const needRenderBlocks = []
      let key
      let offset

      if ((!preBlock || !/th|td/.test(preBlock.type)) && !hasContent) {
        const newLine = this.createBlock('span')
        delete figure.functionType
        figure.children = []
        this.appendChild(figure, newLine)
        figure.text = ''
        figure.type = 'p'
        key = newLine.key
        offset = 0
        needRenderBlocks.push(this.findOutMostBlock(figure))
      } else if (preBlock) {
        key = preBlock.key
        offset = preBlock.text.length
        needRenderBlocks.push(this.findOutMostBlock(preBlock))
      }

      if (key !== undefined && offset !== undefined) {
        this.cursor = {
          start: { key, offset },
          end: { key, offset }
        }

        this.partialRender(needRenderBlocks)
      }
    } else if (inlineDegrade) {
      event.preventDefault()
      event.stopPropagation()
      switch (inlineDegrade.type) {
        case 'STOP': // at begin of article
          // do nothing...
          break
        case 'LI': {
          if (inlineDegrade.info === 'REPLACEMENT') {
            const children = parent.children
            const grandpa = this.getBlock(parent.parent)
            if (children[0].type === 'input') {
              this.removeBlock(children[0])
            }
            children.forEach(child => {
              this.insertBefore(child, grandpa)
            })
            this.removeBlock(grandpa)
          } else if (inlineDegrade.info === 'REMOVE_INSERT_BEFORE') {
            const children = parent.children
            const grandpa = this.getBlock(parent.parent)
            if (children[0].type === 'input') {
              this.removeBlock(children[0])
            }
            children.forEach(child => {
              this.insertBefore(child, grandpa)
            })
            this.removeBlock(parent)
          } else if (inlineDegrade.info === 'INSERT_PRE_LIST') {
            const parPre = this.getBlock(parent.preSibling)
            const children = parent.children
            if (children[0].type === 'input') {
              this.removeBlock(children[0])
            }
            children.forEach(child => {
              this.appendChild(parPre, child)
            })
            this.removeBlock(parent)
          }
          break
        }
        case 'BLOCKQUOTE':
          if (inlineDegrade.info === 'REPLACEMENT') {
            this.replaceBlock(block/* new block */, parent/* old block */)
          } else if (inlineDegrade.info === 'INSERT_BEFORE') {
            this.removeBlock(block)
            this.insertBefore(block, parent)
          }
          break
      }
      this.cursor = selection.getCursorRange()
      if (inlineDegrade.type !== 'STOP') {
        this.render()
      }
    } else if (left === 0 && preBlock) {
      event.preventDefault()
      const text = block.type === 'p' ? block.children.map(line => line.text).join('').trim() : block.text
      const key = preBlock.key
      let offset = preBlock.text.length
      if (preBlock.type === 'pre') {
        const cm = this.codeBlocks.get(key)
        const value = cm.getValue() + text
        cm.setValue(value)
        const { line, ch } = getEndPosition(cm)

        preBlock.pos = { line, ch: ch - text.length }
      } else {
        preBlock.text += text
      }
      this.removeBlock(block)

      this.cursor = {
        start: { key, offset },
        end: { key, offset }
      }
      this.partialRender([ preBlock ])
    }
  }
}

export default backspaceCtrl
