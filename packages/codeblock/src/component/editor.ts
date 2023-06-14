import CodeMirror, { EditorConfiguration, Editor } from "codemirror";
import { debounce } from "lodash";
import {
  $,
  EditorInterface,
  escape,
  isEngine,
  isHotkey,
  isMobile,
  NodeInterface,
} from "@aomao/engine";
import { CodeBlockEditorInterface, Options } from "./types";
const qa = [
  "c",
  "cpp",
  "csharp",
  "erlang",
  "go",
  "groovy",
  "java",
  "kotlin",
  "makefile",
  "objectivec",
  "perl",
  "python",
  "rust",
  "swift",
  "vbnet",
];

const defaultStyles = {
  header: "color: blue;font-weight: bold;",
  quote: "color: #090;",
  negative: "color: #d44;",
  positive: "color: #292;",
  strong: "font-weight: bold;",
  em: "font-style: italic;",
  link: "text-decoration: underline;color: #00c;",
  strikethrough: "text-decoration: line-through;",
  keyword: "color: #d73a49;",
  atom: "color: #905;",
  number: "color: #005cc5;",
  def: "color: #005cc5;",
  variable: "",
  "variable-2": "color: #005cc5;",
  "variable-3": "color: #22863a;",
  type: "color: #22863a;",
  comment: "color: #6a737d;",
  string: "color: #690",
  "string-2": "color: #690;",
  meta: "color: #1f7f9a;",
  qualifier: "color: #555;",
  builtin: "color: #6f42c1;",
  bracket: "color: #997;",
  tag: "color: #22863a;",
  attribute: "color: #6f42c1;",
  hr: "color: #999;",
  error: "color: #f00;",
  invalidchar: "color: #f00;",
  operator: "color: #d73a49;",
  property: "color: #005cc5;",
};

class CodeBlockEditor implements CodeBlockEditorInterface {
  private editor: EditorInterface;
  private options: Options;
  private styleMap: Record<string, string>;
  codeMirror?: Editor;
  mode = "plain";
  container: NodeInterface;

  constructor(editor: EditorInterface, options: Options) {
    this.editor = editor;
    this.options = options;
    this.styleMap = { ...defaultStyles, ...options.styleMap };
    this.container = options.container || $(this.renderTemplate());
  }

  renderTemplate() {
    return '<div class="data-codeblock-container"><div class="data-codeblock-content"></div></div>';
  }

  getConfig(value: string, mode?: string): EditorConfiguration {
    let tabSize = this.codeMirror
      ? this.codeMirror.getOption("indentUnit")
      : qa.indexOf(mode || "") > -1
      ? 4
      : 2;
    const reg = value ? value.match(/^ {2,4}(?=[^\s])/gm) : null;
    if (reg) {
      tabSize = reg.reduce((val1, val2) => {
        return Math.min(val1, val2.length);
      }, 1 / 0);
    }
    return {
      tabSize,
      indentUnit: tabSize,
      scrollbarStyle: "simple",
      readOnly: !isEngine(this.editor) || this.editor.readonly,
      viewportMargin: Infinity,
    };
  }

  getSyntax(mode: string) {
    return this.options.synatxMap[mode] || mode;
  }

  create(mode: string, value: string, options?: EditorConfiguration) {
    this.mode = mode;
    const syntaxMode = this.getSyntax(mode);
    this.codeMirror = CodeMirror(
      this.container.find(".data-codeblock-content").get<HTMLElement>()!,
      {
        value,
        mode: syntaxMode,
        lineNumbers: true,
        lineWrapping: false,
        autofocus: false,
        dragDrop: false,
        ...this.getConfig(value, syntaxMode),
        ...options,
      }
    ) as Editor;
    this.codeMirror.on("focus", () => {
      const { onFocus } = this.options;
      if (onFocus) onFocus();
    });

    this.codeMirror.on("blur", () => {
      const { onBlur } = this.options;
      if (onBlur) onBlur();
    });
    if (isMobile) {
      this.codeMirror.on("touchstart", (_, event) => {
        const { onMouseDown } = this.options;
        if (onMouseDown) onMouseDown(event);
      });
    } else {
      this.codeMirror.on("mousedown", (_, event) => {
        const { onMouseDown } = this.options;
        if (event.button === 2) event.stopPropagation();
        if (onMouseDown) onMouseDown(event);
      });
    }
    this.codeMirror.on(
      "change",
      debounce(() => {
        if (!isEngine(this.editor)) return;
        this.save();
      }, 50)
    );

    this.codeMirror.setOption("extraKeys", {
      Enter: (mirror) => {
        const config = this.getConfig(mirror.getValue());
        Object.keys(config).forEach((key) => {
          return mirror.setOption(
            key as keyof EditorConfiguration,
            config[key as keyof EditorConfiguration]
          );
        });
        mirror.execCommand("newlineAndIndent");
      },
    });
    this.codeMirror.on("keydown", (editor, event) => {
      // 撤销和重做使用codemirror自带的操作
      if (
        isHotkey("mod+z", event) ||
        isHotkey("mod+y", event) ||
        isHotkey("mod+shift+z", event)
      ) {
        event.stopPropagation();
      }
      const lineCount = editor.lineCount();
      const { line, ch } = editor.getCursor();
      const { onUpFocus, onDownFocus, onLeftFocus, onRightFocus } =
        this.options;

      const content = editor.getLine(line);
      // 在最后一行
      if (line === lineCount - 1 && ch === content.length) {
        // 按下下键
        if (isHotkey("down", event) || isHotkey("ctrl+n", event)) {
          if (onDownFocus) onDownFocus(event);
          return;
        }
        // 按下右键
        else if (
          isHotkey("right", event) ||
          isHotkey("shift+right", event) ||
          isHotkey("ctrl+e", event) ||
          isHotkey("ctrl+f", event)
        ) {
          if (onRightFocus) onRightFocus(event);
          return;
        }
      }
      // 在第一行按下上键
      if (line === 0 && ch === 0) {
        // 按下上键
        if (isHotkey("up", event) || isHotkey("ctrl+p", event)) {
          if (onUpFocus) onUpFocus(event);
        }
        // 按下左键
        else if (
          isHotkey("left", event) ||
          isHotkey("shift+left", event) ||
          isHotkey("ctrl+b", event) ||
          isHotkey("ctrl+a", event)
        ) {
          if (onLeftFocus) onLeftFocus(event);
        }
      }
    });
    this.container.on("mousedown", (event: MouseEvent) => {
      if (!this.codeMirror?.hasFocus()) {
        setTimeout(() => {
          this.codeMirror?.focus();
        }, 0);
      }
    });
    return this.codeMirror;
  }

  setAutoWrap(value: boolean) {
    this.codeMirror?.setOption("lineWrapping", value);
  }

  update(mode: string, code?: string) {
    this.mode = mode;
    if (code !== undefined) {
      this.codeMirror?.setValue(code);
    }
    this.codeMirror?.setOption("mode", this.getSyntax(mode));
    this.codeMirror?.setOption(
      "readOnly",
      !isEngine(this.editor) || this.editor.readonly ? true : false
    );
    this.save();
  }

  render(mode: string, value: string, options?: EditorConfiguration) {
    const root = this.container.find(".data-codeblock-content");
    mode = this.getSyntax(mode);
    const stage = $(
      '<div style="font-family: monospace;font-size: 13px; line-height: 21px; color: #595959; direction: ltr; height: auto; overflow: hidden;background: transparent;"><pre style="color: rgb(89, 89, 89); margin: 0px; padding: 0px; background: none 0% 0% / auto repeat scroll padding-box border-box rgba(0, 0, 0, 0);" /></div>'
    );
    root.append(stage);
    const pre = stage.find("pre")[0];
    this.runMode(value || "", mode, pre, {
      ...this.getConfig(value, mode),
      ...options,
    });
  }

  save() {
    if (!isEngine(this.editor) || !this.codeMirror) return;
    // 中文输入过程需要判断
    if (this.editor.change.isComposing()) {
      return;
    }
    const value = this.codeMirror.getValue();
    const { onSave } = this.options;
    if (onSave) onSave(this.mode, value);
  }

  focus() {
    if (!this.codeMirror) return;
    this.codeMirror.focus();
  }

  select(start = true) {
    if (!this.codeMirror) return;
    this.codeMirror.focus();
    if (!start) {
      const line = this.codeMirror.lineCount() - 1;
      const content = this.codeMirror.getLine(line);
      this.codeMirror.setSelection({ line, ch: content.length });
    } else {
      this.codeMirror.setSelection({ line: 0, ch: 0 });
    }
  }

  toHtml(col: number, text: string, style = "", tabSize = 0) {
    tabSize = tabSize || CodeMirror.defaults.tabSize;
    let html = "";
    let content = "";
    // replace tabs

    for (let pos = 0; ; ) {
      const idx = text.indexOf("\t", pos);

      if (idx === -1) {
        content += text.slice(pos);
        col += text.length - pos;
        break;
      } else {
        col += idx - pos;
        content += text.slice(pos, idx);
        const size = tabSize - (col % tabSize);
        col += size;

        for (let i = 0; i < size; ++i) {
          content += " ";
        }

        pos = idx + 1;
      }
    }

    if (style) {
      let styleStr = "";
      style.split(" ").forEach((cls) => {
        styleStr += this.styleMap[cls] ?? "";
      });
      const spanElement = `<span ${
        styleStr ? `style="${styleStr}"` : ""
      }>${escape(content)}</span>`;
      html += spanElement;
    } else {
      html += content;
    }
    return html;
  }

  /**
   * 代码来自 runmode addon
   * 支持行号需要考虑复制粘贴问题
   *
   * runmode 本身不支持行号，见 https://github.com/codemirror/CodeMirror/issues/3364
   * 可参考的解法  https://stackoverflow.com/questions/14237361/use-codemirror-for-standalone-syntax-highlighting-with-line-numbers
   *
   * ref:
   * - https://codemirror.net/doc/manual.html#addons
   * - https://codemirror.net/addon/runmode/runmode.js
   */
  runMode(string: string, modespec: string, callback: any, options: any) {
    const mode = CodeMirror.getMode(CodeMirror.defaults, modespec);

    const tabSize = (options && options.tabSize) || CodeMirror.defaults.tabSize;
    const node = callback;
    let col = 0;
    node.innerHTML = "";
    let html = "";

    const lines = CodeMirror.splitLines(string);
    const state = (options && options.state) || CodeMirror.startState(mode);

    for (let i = 0, e = lines.length; i < e; ++i) {
      if (i) {
        html += "<br />";
        col = 0;
      }
      const stream = new CodeMirror.StringStream(lines[i]);
      if (!stream.string && mode.blankLine) mode.blankLine(state);

      while (!stream.eol()) {
        const style = mode.token ? mode.token(stream, state) : "";
        html += this.toHtml(col, stream.current(), style || "", tabSize);
        stream.start = stream.pos;
      }
    }
    node.innerHTML = html;
  }

  destroy() {
    this.container.remove();
  }
}

export default CodeBlockEditor;
