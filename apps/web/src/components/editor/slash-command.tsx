import type { Editor, Range } from '@tiptap/core'
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionKeyDownProps, SuggestionOptions } from '@tiptap/suggestion'
import Suggestion from '@tiptap/suggestion'

import { getI18n } from '~/i18n/instance'

/* ─── Command item type ──────────────────────────────────── */

export interface SlashCommandItem {
  title: string
  description: string
  icon: string
  command: (props: { editor: Editor, range: Range }) => void
}

/* ─── Available commands ─────────────────────────────────── */

function getSlashCommands(): SlashCommandItem[] {
  const t = getI18n().t
  return [
    {
      title: 'Text',
      description: t('common:slashCommand.paragraph'),
      icon: 'T',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run()
      },
    },
    {
      title: 'Heading 1',
      description: t('common:slashCommand.heading1'),
      icon: 'H1',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
      },
    },
    {
      title: 'Heading 2',
      description: t('common:slashCommand.heading2'),
      icon: 'H2',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
      },
    },
    {
      title: 'Heading 3',
      description: t('common:slashCommand.heading3'),
      icon: 'H3',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
      },
    },
    {
      title: 'Bullet List',
      description: t('common:slashCommand.bulletList'),
      icon: '•',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run()
      },
    },
    {
      title: 'Numbered List',
      description: t('common:slashCommand.orderedList'),
      icon: '1.',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run()
      },
    },
    {
      title: 'Task List',
      description: t('common:slashCommand.taskList'),
      icon: '☐',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run()
      },
    },
    {
      title: 'Code Block',
      description: t('common:slashCommand.codeBlock'),
      icon: '<>',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
      },
    },
    {
      title: 'Quote',
      description: t('common:slashCommand.blockquote'),
      icon: '"',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run()
      },
    },
    {
      title: 'Divider',
      description: t('common:slashCommand.divider'),
      icon: '—',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run()
      },
    },
  ]
}

/* ─── Suggestion render ──────────────────────────────────── */

interface SlashListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

type SuggestionRender = NonNullable<SuggestionOptions<SlashCommandItem, SlashCommandItem>['render']>

const slashCommandSuggestionPluginKey = new PluginKey('slashCommandSuggestion')

const suggestionRender: SuggestionRender = () => {
  let component: ReactRenderer<SlashListRef> | null = null
  let popup: HTMLDivElement | null = null

  return {
    onStart(props) {
      import('./slash-command-list').then(({ SlashCommandList }) => {
        component = new ReactRenderer(SlashCommandList, {
          props: { items: props.items, command: props.command },
          editor: props.editor,
        }) as ReactRenderer<SlashListRef>

        popup = document.createElement('div')
        popup.style.cssText = 'position:fixed;z-index:50;'
        document.body.appendChild(popup)
        popup.appendChild(component.element)

        const rect = props.clientRect?.()
        if (rect && popup) {
          Object.assign(popup.style, { left: `${rect.left}px`, top: `${rect.bottom + 4}px` })
        }
      })
    },

    onUpdate(props) {
      component?.updateProps({ items: props.items, command: props.command })

      const rect = props.clientRect?.()
      if (rect && popup) {
        Object.assign(popup.style, { left: `${rect.left}px`, top: `${rect.bottom + 4}px` })
      }
    },

    onKeyDown(props: SuggestionKeyDownProps) {
      if (props.event.key === 'Escape') {
        popup?.remove()
        component?.destroy()
        popup = null
        component = null
        return true
      }
      return component?.ref?.onKeyDown(props) ?? false
    },

    onExit() {
      popup?.remove()
      component?.destroy()
      popup = null
      component = null
    },
  }
}

/* ─── Extension ──────────────────────────────────────────── */

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor
          range: Range
          props: SlashCommandItem
        }) => {
          props.command({ editor, range })
        },
        items: ({ query }: { query: string }) => {
          return getSlashCommands().filter(item =>
            item.title.toLowerCase().includes(query.toLowerCase()))
        },
        render: suggestionRender,
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        pluginKey: slashCommandSuggestionPluginKey,
      }),
    ]
  },
})
