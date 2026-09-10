# apply-patch

Một `apply_patch` cho mọi model trên Pi: GPT, Claude, Gemini, DeepSeek, Kimi, GLM, Qwen và các model khác. Extension thay `edit`/`write`, tự chọn grammar hoặc JSON function tool theo khả năng của provider.

Repo: [https://github.com/paulpham157/pi-apply-patch](https://github.com/paulpham157/pi-apply-patch)

## Cài đặt

Yêu cầu Pi >=0.85.1 và Node >=22.

```bash
pi install npm:@paulpham157/apply-patch
```

Nếu Pi đang chạy, dùng `/reload`. Extension tự kích hoạt và tiếp tục hoạt động khi đổi model.

## Chức năng

- Tạo, sửa, xóa và move file bằng cùng một patch tool.
- Giới hạn đường dẫn trong `cwd`, từ chối symlink, đích đã tồn tại khi tạo/move và các thao tác chồng đường dẫn.
- Kiểm tra toàn bộ patch trước khi ghi; không rollback toàn bộ nếu xảy ra lỗi filesystem lúc ghi.

Đọc file trước khi sửa; nếu patch lỗi, đọc lại vùng liên quan rồi tạo patch mới. Chất lượng sử dụng patch tùy model. `bash` vẫn hoạt động và không chịu giới hạn đường dẫn của tool này.

## Đóng góp và hỗ trợ

Đọc [CONTRIBUTION.md](CONTRIBUTION.md), [AGENTS.md](AGENTS.md) và chạy các test cần thiết trước khi tạo PR. Hướng dẫn [live test với Pi](docs/live-testing.md) và [phát hành](docs/releasing.md).

Có vấn đề? Tạo issue ở [Đây](https://github.com/paulpham157/pi-apply-patch/issues/new/choose), kèm phiên bản Pi, provider/model và cách tái hiện lỗi. Không đính kèm API key.

Tạo nhanh: [Báo lỗi](https://github.com/paulpham157/pi-apply-patch/issues/new?template=bug.yml) · [Lỗi model/provider](https://github.com/paulpham157/pi-apply-patch/issues/new?template=compatibility.yml) · [Đề xuất tính năng](https://github.com/paulpham157/pi-apply-patch/issues/new?template=feature.yml).

Fork từ [code-yeongyu/pi-apply-patch](https://github.com/code-yeongyu/pi-apply-patch). Giấy phép [MIT](LICENSE).
