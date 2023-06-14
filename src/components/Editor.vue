<template>
  <div class="amEditorVue2">
    <am-loading :loading="loading">
      <am-toolbar v-if="engine" :engine="engine" :items="items" />
      <div :class="['editor-wrapper']">
        <div class="editor-container">
          <div class="editor-content">
            <div ref="container"></div>
          </div>
        </div>
      </div>
      <!-- <div ref="view"></div> -->
    </am-loading>
  </div>
</template>
<script>
import { faker } from "@faker-js/faker";
import Engine, { $, isHotkey, Parser } from "@aomao/engine";
import { message, Modal } from "ant-design-vue";
import AmLoading from "./Loading.vue";
import AmToolbar from "../../packages/toolbar/src";
import items from "./constant";
import { plugins, cards, pluginConfig } from "./config";
import * as Y from "yjs";
import { withYjs, YjsEditor, YCursorEditor } from "@aomao/plugin-yjs";
import { WebsocketProvider } from "@aomao/plugin-yjs-websocket";
import { update } from "@/api/index";
const localMember =
  typeof localStorage === "undefined" ? null : localStorage.getItem("member");
export default {
  components: {
    AmLoading,
    AmToolbar,
    // MapModal,
  },
  data() {
    return {
      loading: true,
      engine: null,
      view: null,
      items: items || [],
      value: "",
      saveTimeout: null,
      connected: false,
      doc: null, // 你需要给 doc 加上初始值
      yjs: {
        url: "wss://collab.aomao.com",
        id: "demo",
      },
      provider: null,
      members: {}, // 光标成员列表
    };
  },
  async mounted() {
    this.members = this.getMember();
    // 创建 Y.Doc 对象
    this.doc = new Y.Doc();
    this.$nextTick(async () => {
      // 创建 Yjs WebsocketProvider 对象
      await this.createProvider();
      await this.initEditor();
      await this.creatConnect();
      // await this.watchCursor();
    });
    console.log(this.connected, "this.connected");
    document.addEventListener("keydown", this.docKeydown);
    this.$once("hook:beforeDestroy", () => {
      document.removeEventListener("keydown", this.docKeydown);
    });
  },
  destroyed() {
    if (this.engine) this.engine.destroy();
  },
  watch: {
    connected: {
      handler: function (val) {
        if (val) {
          if (this.engine) {
            YjsEditor.connect(this.engine);
            this.watchCursor();
          }
        }
      },
      // immediate: true,
    },
  },
  methods: {
    getMember() {
      if (localMember === null) {
        const { name } = faker;
        const member = {
          name: `${name.firstName()} ${name.lastName()}`,
          avatar: faker.image.avatar(),
          color: faker.color.rgb(),
        };
        localStorage.setItem("member", JSON.stringify(member));
        return member;
      }
      return JSON.parse(localMember);
    },
    // 创建 Yjs WebsocketProvider 对象
    createProvider() {
      // 如果全局变量 yjs 不存在，或者 yjs.url 和 yjs.id 不存在，则返回
      if (!this.yjs.url || !this.yjs.id) {
        this.provider = null;
        return;
      }
      // 创建 Yjs WebsocketProvider 对象
      this.provider = new WebsocketProvider(
        this.yjs.url,
        this.yjs.id,
        this.doc,
        { connect: false }
      );
      // 监听 Yjs WebsocketProvider 对象状态事件
      this.provider.on("status", this.handleStatus);
      // 在组件被卸载时，移除事件监听器
      this.$once("hook:beforeDestroy", () => {
        if (this.provider) {
          this.provider = null;
        }
      });
    },
    // Yjs WebsocketProvider 对象状态事件处理器
    handleStatus(event) {
      const { status } = event;
      if (status === "connected") {
        this.connected = true;
      } else if (status === "connecting") {
        this.loading = true;
      } else if (status === "disconnected") {
        this.connected = false;
      }
      this.loading = false;
    },
    // 定义保存的方法
    async save(value) {
      if (!this.engine) return;
      // const filterValue = this.engine.command.executeMethod(
      //   "mark-range",
      //   "action",
      //   "comment",
      //   "filter",
      //   value
      // );
      const filterValue = { value, paths: [] };
      // 保存逻辑，后续调用api保存
      await update(filterValue);
    },
    autoSave() {
      if (this.saveTimeout) clearTimeout(this.saveTimeout);
      this.saveTimeout = setTimeout(() => {
        const value = this.engine?.model.toValue() || "";
        this.save(value);
      }, 60000);
    },
    userSave() {
      if (!this.engine) return;
      this.engine.model
        .toValueAsync(undefined, (pluginName, card) => {
          console.log(`${pluginName} 正在等待...`, card?.getValue());
        })
        .then((value) => {
          this.save(value);
        })
        .catch((data) => {
          console.log("终止保存：", data.name, data.card?.getValue());
        });
    },
    docKeydown() {
      if (!this.engine) return;
      if (isHotkey("mod+s", event)) {
        event.preventDefault();
        this.userSave();
      }
    },
    initEditor() {
      // 容器加载后实例化编辑器引擎
      const container = this.$refs.container;
      if (container) {
        //实例化引擎
        const engine = new Engine(container, {
          // 启用的插件
          plugins,
          // 启用的卡片
          cards,
          // 所有的卡片配置
          config: pluginConfig,
        });
        // 设置显示成功消息UI，默认使用 console.log
        engine.messageSuccess = (type, msg, ...args) => {
          message.success(msg);
        };
        // 设置显示错误消息UI，默认使用 console.error
        engine.messageError = (type, error, ...args) => {
          message.error(error);
        };
        // 设置显示确认消息UI，默认无
        engine.messageConfirm = (type, msg, ...args) => {
          return (
            new Promise() <
            boolean >
            ((resolve, reject) => {
              Modal.confirm({
                content: msg,
                onOk: () => resolve(true),
                onCancel: () => reject(),
              });
            })
          );
        };
        //卡片最大化时设置编辑页面样式
        engine.on("card:maximize", () => {
          $(".editor-toolbar").css("z-index", "9999").css("top", "55px");
        });
        engine.on("card:minimize", () => {
          $(".editor-toolbar").css("z-index", "").css("top", "");
        });
        // 监听编辑器值改变事件
        engine.on("change", () => {
          if (this.loading) return;
          //自动保存，非远程更改，触发保存
          // const value = engine.model.toValue();
          // this.value = value;
          // this.autoSave(value);
        });
        window.engine = engine;
        window.Parser = Parser;
        this.engine = engine;
      }
    },
    // 创建连接
    creatConnect() {
      if (!this.engine) return;
      //设置编辑器值
      const value = this.value
        ? this.value?.paths?.length > 0
          ? this.engine.command.executeMethod(
              "mark-range",
              "action",
              "comment",
              "wrap",
              this.value?.paths,
              this.value?.value
            )
          : this.value?.value
        : null;
      //连接到协作服务端，demo文档
      const handleCustomMessage = (message) => {
        const { action } = message;
        if (value && action === "initValue") {
          this.engine?.setValue(value);
          this.engine?.history.clear();
        }
      };
      if (this.yjs && this.provider) {
        this.provider.connect();
        this.provider.on("customMessage", handleCustomMessage);
        const sharedType = this.doc.get("content", Y.XmlElement);
        withYjs(this.engine, sharedType, this.provider.awareness, {
          data: this.member,
        });
      } else {
        // 非协同编辑，设置编辑器值，异步渲染后回调
        this.engine.setValue(value, (count) => {
          console.log("setValue loaded:", count);
        });
      }
    },
    // 监听光标事件
    watchCursor() {
      // 获取编辑器引擎对象
      const engine = this.engine;
      // 如果编辑器引擎对象不存在，则返回
      if (!engine) return;
      // 定义光标位置变化的事件处理器
      const handleCursorChange = (event) => {
        // 获取添加的光标和删除的光标
        const { added, removed } = event;
        // 处理添加的光标
        if (added.length > 0) {
          added.forEach((id) => {
            const newMember = YCursorEditor.cursorState(engine, id);
            if (newMember?.data) {
              this.$set(this.members, id, newMember.data);
            }
          });
        }
        // 处理删除的光标
        if (removed.length > 0) {
          removed.forEach((id) => {
            this.$delete(this.members, id);
          });
        }
      };

      // 监听编辑器的光标位置变化事件
      YCursorEditor.on(engine, "change", handleCursorChange);
      // 在组件被卸载时，移除事件监听器
      this.$once("hook:beforeDestroy", () => {
        YCursorEditor.off(engine, "change", handleCursorChange);
      });
    },
  },
};
</script>
<style scoped lang="less">
#app {
  padding: 0;
}
#nav {
  position: relative;
}

.editor-toolbar {
  position: fixed;
  width: 100%;
  background: #ffffff;
  box-shadow: 0 2px 2px 0 rgba(0, 0, 0, 0.02);
  z-index: 1000;
}
.editor-wrapper {
  position: relative;
  width: 100%;
  min-width: 1440px;
}

.editor-container {
  background: #fafafa;
  background-color: #fafafa;
  padding: 62px 0 64px;
  height: calc(100vh);
  width: 100%;
  margin: 0 auto;
  overflow: auto;
  position: relative;
}

.editor-content {
  position: relative;
  width: 812px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #f0f0f0;
  min-height: 800px;
}

.editor-content .am-engine {
  padding: 40px 60px 60px;
}
</style>
