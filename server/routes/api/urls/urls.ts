import Router from "koa-router";
import { head, orderBy } from "lodash";
import parseDocumentSlug from "@shared/utils/parseDocumentSlug";
import parseMentionUrl from "@shared/utils/parseMentionUrl";
import { NotFoundError } from "@server/errors";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import { Document, User } from "@server/models";
import { authorize } from "@server/policies";
import { APIContext } from "@server/types";
import * as T from "./schema";

const router = new Router();

router.post(
  "urls.unfurl",
  auth(),
  validate(T.UrlsUnfurlSchema),
  transaction(),
  async (ctx: APIContext<T.UrlsUnfurlReq>) => {
    const { url, documentId } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;
    const urlObj = new URL(url);
    if (urlObj.protocol === "mention:") {
      const { modelId: userId } = parseMentionUrl(url);

      const [mentionedUser, document] = await Promise.all([
        User.findByPk(userId, { transaction }),
        Document.findByPk(documentId!, {
          userId,
          transaction,
        }),
      ]);
      if (!mentionedUser) {
        throw NotFoundError("Mentioned user does not exist");
      }
      if (!document) {
        throw NotFoundError("Document does not exist");
      }
      authorize(user, "read", mentionedUser);
      authorize(user, "read", document);

      const lastView = head(orderBy(document.views, ["updatedAt"], ["desc"]));

      ctx.body = {
        url,
        type: "mention",
        title: mentionedUser.name,
        meta: {
          id: mentionedUser.id,
          lastActiveAt: mentionedUser.lastActiveAt,
          lastViewedAt: lastView ? lastView.updatedAt : undefined,
          url: "",
        },
      };

      return;
    }

    const docId = parseDocumentSlug(url);
    const document = await Document.findByPk(docId!, { transaction });
    if (!document) {
      throw NotFoundError("Document does not exist");
    }
    authorize(user, "read", document);

    ctx.body = {
      url,
      type: "document",
      title: document.titleWithDefault,
      meta: {
        id: document.id,
        updatedAt: document.updatedAt,
        createdAt: document.createdAt,
        updatedBy: document.updatedBy,
        createdBy: document.createdBy,
        summary: document.text.trim().split("\n").slice(0, 4).join("\n"),
        url: document.url,
      },
    };
  }
);

export default router;