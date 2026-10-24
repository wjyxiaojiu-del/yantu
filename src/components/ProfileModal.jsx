import { useRef, useState } from 'react';
import { Camera, Trash2, Loader2 } from 'lucide-react';
import Modal from './Modal';
import api from '../api';
import { useToast } from './Toast';
import { useAuth } from '../context/AuthContext';

export function AvatarView({ user, size = 36, className = '' }) {
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={`${user.name || '我'}的头像`}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${className}`}
      style={{
        width: size, height: size, fontSize: Math.max(11, size * 0.38),
        background: 'linear-gradient(135deg, var(--accent, #3b82f6), var(--accent-light, #60a5fa))',
      }}
    >
      {user?.name?.[0] || '我'}
    </div>
  );
}

export default function ProfileModal({ onClose }) {
  const toast = useToast();
  const { user, patchUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const pickFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('头像图片不能超过 2MB');
      event.target.value = '';
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { toast.error('姓名不能为空'); return; }
    setSaving(true);
    try {
      let latest = null;
      if (trimmed !== user.name) {
        latest = await api.updateProfile({ name: trimmed });
      }
      if (avatarFile) {
        const formData = new FormData();
        formData.append('file', avatarFile);
        latest = await api.uploadAvatar(formData);
      } else if (!avatarPreview && user.avatar) {
        latest = await api.removeAvatar();
      }
      if (latest?.user) patchUser(latest.user);
      toast.success('个人资料已更新');
      onClose();
    } catch (e) {
      toast.error(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const previewUser = { ...user, name: name || user?.name, avatar: avatarPreview };

  return (
    <Modal title="个人资料" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <AvatarView user={previewUser} size={64} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
              aria-label="更换头像"
            >
              <Camera size={20} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-secondary py-1.5 px-3 text-xs">
              <Camera size={13} />选择图片
            </button>
            {(avatarPreview || user?.avatar) && (
              <button type="button" onClick={clearAvatar} className="text-[11px] text-slate-400 hover:text-red-500 inline-flex items-center gap-1">
                <Trash2 size={11} />移除头像
              </button>
            )}
            <p className="text-[10px] text-slate-300">png / jpg / webp / gif，不超过 2MB</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pickFile} className="hidden" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">名称</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            className="input"
            placeholder="显示在工作台中的名称"
            maxLength={30}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">取消</button>
          <button type="submit" disabled={saving || !name.trim()} className="btn btn-primary">
            {saving ? <><Loader2 size={14} className="animate-spin" />保存中…</> : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
