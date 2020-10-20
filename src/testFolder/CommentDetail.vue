<template>
  <div class="main comment">
    <div class="view-source" v-if="queryPostId">
      <z-button type="link" @click="jumpToPostDetail">查看原帖</z-button>
    </div>
    <div class="comment-list">
      <template v-if="commentInfo">
        <div class="comment-list__item">
          <comment-item
            :commentInfo="commentInfo"
            :uid="commentInfo.commenterId"
            @contentclick="popUpReply(commentInfo)"
            @likeclick="onLikeClick(commentInfo)"
          />
          <!-- 二级评论 -->
          <template v-if="commentInfo.replyCount !== 0">
            <div
              class="comment-reply"
              :class="newCommentId === item.commentId ? 'highlight' : ''"
              v-for="(item, index) in replyCommentList"
              :key="index"
            >
              <comment-item
                :replyCommentInfo="item"
                :uid="commentInfo.commenterId"
                @contentclick="popUpReply(item, index)"
                @likeclick="onLikeClick(item, index)"
              />
            </div>
          </template>
        </div>
        <div class="comment-list__loadmore">
          <z-button
            :loading="loadMoreStatus === 1"
            type="text"
            loading-text="加载中..."
            size="small"
            @click="loadMoreComments"
            >{{ loadMoreStatus === 0 ? '加载更多' : '' }}</z-button
          >
        </div>
      </template>
      <template v-if="commentInfo && isNoMessage">
        <z-stance type="message" />
      </template>
    </div>
    <!-- 填写评论回复 -->
    <transition name="z-slide-up">
      <div class="comment-editor" v-show="isShowForm" v-ios-x-bottom-margin>
        <z-cell-group>
          <z-field
            v-model="message"
            type="textarea"
            :placeholder="replyPlaceholder"
            rows="3"
            autosize
            :maxlength="100"
            count-word
          />
        </z-cell-group>
        <div class="sub-btn">
          <z-button class="cancel-btn" size="small" @click="submitCommentCancel">取消</z-button>
          <z-button type="primary" size="small" @click="submitComment">提交</z-button>
        </div>
      </div>
    </transition>
    <z-actionsheet
      v-model="isShowPopupReply"
      :actions="replyActions"
      :title="replyPopupTitle"
      cancel-text="取消"
      @select="onPopupSelect"
    />
    <loading v-if="isLoading"></loading>
  </div>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator'
import CommentItem from '@/components/CommentItem/CommentItem.vue'
import Loading from '@/components/Loading/Loading.vue'
import {
  commentDetail,
  getSecondPostsCommentList,
  addPostsComment,
  delPostsComment,
  dolike
} from '@/api/post'
  /* eslint-disable no-unused-vars */
import { CommonRspInterface, SecondCommentInterface, CommentInterface } from '@/api/post.d.ts'
/* eslint-enable no-unused-vars */
import { isZZ, isLogin, login, enterUnifiedUrl } from '@/lib/sdk'
import { getUID } from '@/lib/cookie'
import URL from '@/lib/url'
// import VARS from '@/lib/vars'
import { Button, Field, CellGroup, Stance, Actionsheet } from '@zz-common/zz-ui'
import { compareVersion, getAppVersion } from '@/lib/util'
import { debounce } from 'lodash'

Vue.use(Button).use(Field).use(CellGroup).use(Stance).use(Actionsheet)

// 评论提醒落地页，从通知进入
// commentDetail 只是一级评论的详情，针对这条评论的回复还需要查询 二级评论接口
@Component({
  components: {
    CommentItem,
    Loading
  }
})
export default class extends Vue {
  public isLoading: boolean = false
  // 是否没有消息
  public isNoMessage: boolean = false
  // 回复菜单--是否显示回复菜单
  public isShowPopupReply: boolean = false
  // 回复菜单--回复评论菜单项，自己的评论需要显示“删除”
  public replyActions: object[] = []
  // 回复菜单--回复评论弹窗标题
  public replyPopupTitle: string = ''
  // 参数中的一级评论ID
  public queryCommentId: string
  // 需要高亮的评论ID
  public newCommentId: string
  // 帖子ID
  public queryPostId: string = ''
  // 一级评论
  public commentInfo: CommentInterface = null
  // 二级评论
  public replyCommentList: SecondCommentInterface[] = []
  // 用户uid
  public uid: string
  // 显示表单
  public isShowForm: boolean = false
  // 留言信息
  public message: string = ''
  // 分页page
  public pageOffset: string = '0'
  // 更多加载状态
  public loadMoreStatus: number = 0 // 0 加载更多，1 加载中，2 没有更多
  // 回复评论表单--回复的评论ID
  public toCommentId: string
  // 回复评论表单--填写内容的 placeholder
  public replyPlaceholder: string = '回复'

  public async created() {
    this.queryCommentId = URL.getQueryParam('commentId') || URL.getQueryParam('commentid')
    this.queryPostId = URL.getQueryParam('postid') || URL.getQueryParam('postId')
    this.newCommentId = URL.getQueryParam('n_commentid') || URL.getQueryParam('n_commentId')
    // 需要登陆
    if (!isLogin()) {
      login(() => {
        this.uid = getUID()
        this.queryCommentById()
      })
    }
    this.uid = getUID()
    await this.queryCommentById()
    if (this.commentInfo && this.commentInfo.replyCount) {
      this.querySecondComment()
    } else {
      this.loadMoreStatus = 2
    }
  }

  public mounted() {
    /**
       * @log 页面展现
       */
    this.$legic('page_view')
  }

  // 获取评论信息
  public queryCommentById() {
    this.isLoading = true
    return commentDetail({ commentId: this.queryCommentId })
      .then((res: CommonRspInterface<{ comments: CommentInterface }>) => {
        /**
           * @log 获取评论信息（一级评论）
           * @backup commentId：评论ID
           */
        this.$legic('query_comment', { commentId: this.queryCommentId })
        if (res.respCode === 0) {
          this.commentInfo = res.respData.comments
          // 如果 url 参数中没有传 postid，尝试从评论列表中取
          if (!this.queryPostId) {
            this.queryPostId = this.commentInfo.postsId
          }
        } else {
          this.$toast(res.errMsg || '出错了')
          this.isNoMessage = true
        }
      })
      .catch((e) => {
        console.error('异常', e)
        this.isNoMessage = true
      })
      .finally(() => {
        this.isLoading = false
      })
  }

  public querySecondComment() {
    return getSecondPostsCommentList({
      postsId: this.queryPostId,
      rootCommentId: this.queryCommentId,
      offset: this.pageOffset,
      pageSize: '10'
    })
      .then((res: CommonRspInterface<{ comments: SecondCommentInterface[]; offset: string }>) => {
        /**
           * @log 获取评论信息（二级评论）
           * @backup rootCommentId: 根评论ID
           */
        this.$legic('query_second_comment', { rootCommentId: this.queryCommentId })
        if (res.respCode === 0) {
          const { comments, offset } = res.respData
          // 是不是分页加载
          if (this.pageOffset === '0') {
            this.replyCommentList = comments
          } else {
            this.replyCommentList = this.replyCommentList.concat(comments)
          }

          if (offset === '-1') {
            this.loadMoreStatus = 2 // 没有更多
          } else {
            this.loadMoreStatus = 0 // 加载更多
            this.pageOffset = offset
          }
        } else {
          this.$toast(res.errMsg || '出错了')
        }
      })
      .catch((e) => {
        console.error('异常', e)
        this.isNoMessage = true
      })
      .finally(() => {
        this.isLoading = false
      })
  }

  // 提交评论请求
  public addComment() {
    this.isLoading = true
    return addPostsComment({
      postsId: this.queryPostId,
      toCommentId: this.toCommentId,
      content: this.message.trim()
    })
      .then((res: CommonRspInterface<any>) => {
        /**
           * @log 添加评论请求
           * @backup toCommentId: 评论的ID
           */
        this.$legic('add_comment', { toCommentId: this.toCommentId })
        if (res.respCode === 0) {
          // 评论ID,提示信息,评论的根ID
          const { alertWinInfo } = res.respData
          this.$toast(alertWinInfo || '已回复')
          this.isShowForm = false
          this.message = ''
          this.querySecondComment()
        } else {
          this.$toast(res.errMsg || '出错了')
        }
      })
      .catch((e) => {
        console.error('异常', e)
      })
      .finally(() => {
        this.isLoading = false
      })
  }

  /**
     * 点赞/取消赞请求
     * @param object.itemId {string} 根据type设置帖子ID或者帖子评论ID
     * @param object.itemtype {string} 点赞类型：1 帖子点赞 2 帖子评论点赞
     * @param object.action {string} 点赞动作：1点赞 2取消点赞
     */
  public likeComment({ itemId, itemtype, action }, index?) {
    /**
       * @log 点赞请求
       * @backup itemType: 点赞类型：1 帖子点赞 2 帖子评论点赞 itemId: 根据type设置帖子ID或者帖子评论ID action: 点赞动作：1点赞 2取消点赞
       */
    this.$legic('comment_like_click', { itemId, itemtype, action })
    return dolike({
      itemId,
      itemtype,
      action
    })
      .then((res: CommonRspInterface<{ desc: string }>) => {
        if (res.respCode === 0) {
          if (action === '1') {
            // 点赞
            if (index === undefined) {
              // 一级评论
              this.commentInfo.likeCount =
                  Number.parseInt(this.commentInfo.likeCount, 10) + 1 + ''
              this.commentInfo.isLike = '1'
            } else {
              // 二级评论
              this.replyCommentList[index].likeCount =
                  Number.parseInt(this.replyCommentList[index].likeCount, 10) + 1 + ''
              this.replyCommentList[index].isLike = '1'
            }
          } else {
            // 取消点赞
            if (index === undefined) {
              this.commentInfo.likeCount =
                  Number.parseInt(this.commentInfo.likeCount, 10) - 1 + ''
              this.commentInfo.isLike = '0'
            } else {
              this.replyCommentList[index].likeCount =
                  Number.parseInt(this.replyCommentList[index].likeCount, 10) - 1 + ''
              this.replyCommentList[index].isLike = '0'
            }
          }

          this.$toast(res.respData.desc || '操作成功')
        } else {
          this.$toast(res.errMsg || '出错了')
        }
      })
      .catch((e) => {
        console.error('异常', e)
      })
  }

  // 删除评论
  public delComment(commentId: string, index?: number) {
    this.isLoading = true
    delPostsComment({
      commentId
    })
      .then((res: CommonRspInterface<string>) => {
        /**
           * @log 删除评论请求
           * @backup commetId：评论ID
           */
        this.$legic('del_comment', { commentId })
        if (res.respCode === 0) {
          if (index === undefined) {
            this.querySecondComment()
          } else {
            this.replyCommentList.splice(index, 1)
          }
          this.$toast('删除成功')
        } else {
          this.$toast(res.errMsg || '出错了')
        }
      })
      .catch((e) => {
        console.error('异常', e)
      })
      .finally(() => {
        this.isLoading = false
      })
  }

  // 加载更多评论
  public loadMoreComments() {
    /**
       * @log 加载更多评论
       */
    this.$legic('lode_more_comment')
    if (this.loadMoreStatus === 0) {
      this.loadMoreStatus = 1 // 加载中
      this.querySecondComment()
    }
  }

  // 添加评论点击
  public popUpReply(comment: any, index?: number) {
    /**
       * @log 添加评论菜单点击
       */
    this.$legic('reply_menu_popup')
    const actions = [{ name: '回复评论', id: 1, commentId: comment.commentId, index }]
    if (comment.commenterId === this.uid) {
      // 自己的评论
      actions.push({ name: '删除', id: 2, commentId: comment.commentId, index })
    }
    this.replyActions = actions
    this.replyPopupTitle = `${comment.commenterName} ${
      comment.beReplyerName ? '回复' + comment.beReplyerName : ''
    }: ${comment.content}`
    this.replyPlaceholder = `回复 ${comment.commenterName}`
    this.isShowPopupReply = true
  }

  // 点击回复评论弹出菜单
  public onPopupSelect(item) {
    /**
       * @log 点击弹出菜单
       * @backup itemId: 1 回复评论，2: 删除评论
       */
    this.$legic('on_popup_action', { itemId: item.id })
    this.isShowPopupReply = false
    // 回复评论
    if (item.id === 1) {
      this.toCommentId = item.commentId
      this.isShowForm = true
    }
    // 删除评论
    if (item.id === 2) {
      this.$dialog
        .confirm({
          message: '确认删除这条评论吗？'
        })
        .then(() => {
          this.delComment(item.commentId, item.index)
        })
        .catch(() => {})
    }
  }

  // 提交评论
  async submitComment() {
    /**
       * @log 提交评论按钮点击
       */
    this.$legic('submit_comment_click')
    if (this.message.trim().length === 0) {
      this.$toast('请输入评论信息')
      return
    }
    await this.addComment()
  }

  // 取消添加评论
  public submitCommentCancel() {
    /**
       * @log 取消评论按钮点击
       */
    this.$legic('cancel_submit')
    this.isShowForm = false
  }

  // 点赞
  public onLikeClick = debounce(
    (comment: any, index?: number) => {
      this.likeComment(
        {
          itemId: comment.commentId,
          itemtype: '2',
          action: comment.isLike && comment.isLike === '1' ? '2' : '1'
        },
        index
      )
    },
    200,
    {
      leading: true,
      trailing: false
    }
  )

  // 跳转到帖子详情
  public jumpToPostDetail() {
    /**
       * @log 查看原帖点击
       * @backup postId： 帖子ID
       */
    this.$legic('view_sorce_post', { postId: this.queryPostId })
    if (isZZ) {
      if (compareVersion(getAppVersion(), '7.5.5') !== -1) {
        // 统一跳转地址直接跳转
        enterUnifiedUrl({
          unifiedUrl: `zhuanzhuan://jump/community/postDetail/jump?postId=${this.queryPostId}`,
          needClose: '1'
        })
      }
    }
  }
}
</script>

<style lang="scss" scoped>
  @import '@/assets/vars.scss';

  .z-actionsheet__header {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    padding-left: 32px;
    padding-right: 32px;
  }

  @keyframes lightbg {
    0% {
      background-color: #fff;
    }

    50% {
      background-color: $yellow;
    }

    100% {
      background-color: #fff;
    }
  }

  .view-source {
    text-align: right;
  }

  // 评论(同 post.vue)
  .comment {
    position: relative;
    padding: 32px 48px 128px;
    background-color: #fff;
    min-height: 100vh;
    box-sizing: border-box;

    &__title {
      font-family: PingFangSC-Medium;
      font-size: 32px;
      color: #2e3135;
      letter-spacing: 0;
      line-height: 32px;
      margin-left: -4px;
    }

    .comment-list {
      .see-all {
        position: relative;
        margin-left: 72px;
        margin-top: 36px;

        .z-button__text {
          font-size: 28px;
        }
      }

      &__loadmore {
        text-align: center;

        .z-button--link,
        .z-button--text {
          color: $second-font;
        }
      }
    }

    .comment-reply {
      margin-left: 72px;

      &.highlight {
        animation: lightbg 0.8s ease-in-out 1s 3;
      }

      .see-all {
        margin-left: 0;
      }
    }

    .activity-info {
      margin-top: 33px;
    }
  }
  // 回复评论
  .comment-editor {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    background-color: $gray-bg;
    padding: 32px 32px 0;

    .sub-btn {
      margin-top: 20px;
      float: right;

      .cancel-btn {
        margin-right: 24px;
      }
    }
  }
</style>
