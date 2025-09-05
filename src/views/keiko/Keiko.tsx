import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import AnimatedView from '@/views/common/AnimatedView.tsx';
import {useRealtime} from '@/components/voice-tool/use-realtime.tsx';
import type {Update} from '@/store/voice-client';
import {useUser} from '@/store/use-user.tsx';
import usePersistStore from '@/store/use-persist-store';
import {useEffortStore} from '@/store/effort';
import {useOutputStore} from '@/store/output';
import FileImagePicker, {type FileInputHandle,} from '@/components/file-image-picker/file-image-picker.tsx';
import VideoImagePicker from '@/components/video-image-picker/video-image-picker.tsx';
import {API_ENDPOINT} from '@/store/endpoint.ts';
import { apiClient } from '@/api/client'
import { AgentExecuteRequestSchema, AgentExecuteResponseSchema } from '@/api/types/agents'
import {v4 as uuidv4} from 'uuid';
import {fetchCachedImage} from '@/store/images.ts';
import {BsMic, BsMicMute} from 'react-icons/bs';
import styles from '@/views/keiko/keiko.module.scss';
import clsx from 'clsx';
import VoiceTool from '@/components/voice-tool/voice-tool.tsx';
import ImageGallery from '@/components/output/image-gallery';
import ImageParamsDialog, {type ImageParams} from '@/components/dialogs/image-params-dialog';
import CameraCapture, { type CameraCaptureHandle } from '@/components/camera/camera-capture';

interface ImageFunctionCall {
  id: string;
  call_id: string;
  name: string;
  arguments: Record<string, any>;
  image?: string;
}

const Keiko: React.FC = () => {
  const { user, error } = useUser();
  const [showCapture, setShowCapture] = useState(false);
  const [showParamsDialog, setShowParamsDialog] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>(undefined);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsError, setParamsError] = useState<string | null>(null);

  const [imageFunctionCall, setImageFunctionCall] = useState<ImageFunctionCall>();
  const filePickerRef = useRef<FileInputHandle>(null);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const cameraRef = useRef<CameraCaptureHandle>(null);

  useEffect(() => {
    if (error) {
      console.error('Error fetching user data:', error);
    }
  }, [error]);

  const effort = usePersistStore(useEffortStore, (state) => state);
  const output = usePersistStore(useOutputStore, (state) => state);
  useEffect(() => {
    if (user?.key) {
      console.log('[Keiko] Setting session to user.key', user.key);
      output?.setSession(user.key);
    }
  }, [user?.key]);

  const addOutput = async (
    parent: string,
    agent: string,
    call_id: string,
    content: any,
  ) => {
    // Normalisiere Content in ein Array von Items
    const items: Array<Record<string, any>> = Array.isArray(content)
      ? content
      : Array.isArray(content?.content)
      ? content.content
      : [];

    console.log('[Keiko] addOutput called', { parent, agent, call_id, items });

    if (!items.length) {
      console.warn('[Keiko] addOutput: no iterable content provided');
      return;
    }

    for (const item of items) {
      if (item.type === 'text') {
        await sendRealtime({id: uuidv4(), type: 'function_completion', call_id, output: item.value});
        output?.addOutput(parent, agent, {
          id: uuidv4(),
          title: agent,
          value: 1,
          data: {id: uuidv4(), type: 'text', value: item.value, annotations: item.annotations},
          children: [],
        });
      } else if (item.type === 'image') {
        await sendRealtime({
          id: uuidv4(), type: 'function_completion', call_id,
          output: `Generated image (${item.size}, ${item.quality}).`
        });

        const sessionId = output?.currentSessionId || user.key;
        const node = {
          id: uuidv4(), title: agent, value: 1,
          data: {
            id: uuidv4(), type: 'image', description: item.description,
            image_url: item.image_url, size: item.size, quality: item.quality,
            created_at: new Date().toISOString(), session_id: sessionId,
          },
          children: [] as any[],
        };
        console.log('[Keiko] adding image node', node);
        output?.addOutput(parent, agent, node);

        // Debug: gesamter Storezustand
        console.log('[Keiko] output store after image', output?.output);
      } else if (item.type === 'video') {
        await sendRealtime({
          id: uuidv4(),
          type: 'function_completion',
          call_id: call_id,
          output: `Generated video as described by ${item.description}. It is ${item.duration} seconds long. It has been saved and is currently being displayed to ${user.name}.`,
        });

        output?.addOutput(parent, agent, {
          id: uuidv4(),
          title: agent,
          value: 1,
          data: {
            id: uuidv4(),
            type: 'video',
            description: item.description,
            video_url: item.video_url,
            duration: item.duration,
          },
          children: [],
        });
      } else {
        // Unbekannter Item-Typ: ignoriere
      }
    }
  };

  const handleServerMessage = async (serverEvent: Update): Promise<void> => {
    console.log('[Keiko] serverEvent', serverEvent);
    switch (serverEvent.type) {
      case 'message':
        if (serverEvent.content) {
          effort?.addEffort(serverEvent);
        }
        break;
      case 'function':
        // Foto-Workflow: UI direkt öffnen
        if (serverEvent.name === 'photo_request') {
          setShowPhotoCapture(true);
          break;
        }
        if (serverEvent.name === 'capture_photo' || (serverEvent.name === 'photo_capture')) {
          setShowPhotoCapture(true);
          // kurz warten bis die Komponente gerendert ist
          setTimeout(() => cameraRef.current?.captureNow(), 50);
          break;
        }

        if (serverEvent.arguments?.kind) {
          setImageFunctionCall({
            id: serverEvent.id,
            call_id: serverEvent.call_id,
            name: serverEvent.name,
            arguments: serverEvent.arguments,
          });
          if (serverEvent.arguments.kind === 'FILE') {
            sendRealtime({
              id: serverEvent.id,
              type: 'function_completion',
              call_id: serverEvent.call_id,
              output: `This is a message from the function call that it is in progress. Let the user know that they can upload a file and it will be processed by the agent.`,
            });

            filePickerRef.current?.activateFileInput();
          }
        } else {
          // check for client side agents
          sendRealtime({
            id: serverEvent.id,
            type: 'function_completion',
            call_id: serverEvent.call_id,
            output: `This is a message from the function call that it is in progress.
            You can ignore it and continue the conversation until the function call is completed.`,
          });

          effort?.addEffort(serverEvent);

          // check for `image_url` in the arguments
          if (serverEvent.arguments?.image_url) {
            console.log('Image URL found in arguments', serverEvent.arguments);
            const images = output?.getAllImages();
            // if there's only one image, set the image_url to the first image
            if (images && images.length > 0) {
              serverEvent.arguments.image_url = `${API_ENDPOINT}/${
                images[images.length - 1].image_url
              }`;
            }
          }

          const api = `/api/agent/${user.key}`;
          console.log('Sending function call to agent', api, serverEvent);
          await apiClient.post(
            api,
            AgentExecuteResponseSchema,
            {
              body: {
                call_id: serverEvent.call_id,
                id: serverEvent.id,
                name: serverEvent.name,
                arguments: serverEvent.arguments,
              },
            }
          )
        }
        break;
      case 'agent':
        effort?.addEffort(serverEvent);
        // Foto-Workflow: Agent-Antwort ohne Content -> Kamera anzeigen
        if (serverEvent.name === 'photo_request') {
          setShowPhotoCapture(true);
          break;
        }
        if (serverEvent.name === 'photo_capture') {
          setShowPhotoCapture(true);
          setTimeout(() => cameraRef.current?.captureNow(), 50);
          break;
        }
        if (serverEvent.name === 'photo_upload') {
          setTimeout(() => cameraRef.current?.confirmSaveNow(), 50);
          break;
        }
        if (serverEvent.status.toLowerCase().includes('failed')) {
          await sendRealtime({
            id: serverEvent.id,
            type: 'function_completion',
            call_id: serverEvent.call_id,
            output: `The ${serverEvent.name} has failed. Please let the user know there may be issues with this agent in the service and are happy to help in any other way available to you.`,
          });
          break;
        }
        if (serverEvent.output && serverEvent.content) {
          // Falls Follow-up erforderlich: Dialog öffnen
          if (serverEvent.content?.requires_more_info) {
            setPendingPrompt(serverEvent.content?.message || '');
            setShowParamsDialog(true);
            break;
          }
          const normalized = Array.isArray(serverEvent.content?.content)
            ? serverEvent.content.content
            : Array.isArray(serverEvent.content)
            ? (serverEvent.content as any)
            : [];
          if (normalized.length) {
            addOutput(
              serverEvent.name.toLowerCase().replaceAll(' ', '_'),
              serverEvent.name,
              serverEvent.call_id,
              normalized,
            );
          } else {
            console.warn('[Keiko] agent event had no iterable content');
          }
        }
        break;
        // @ts-ignore
      case 'photo_capture':
        // Serverseitiger Trigger: Kamera anzeigen und sofort fotografieren
        setShowPhotoCapture(true);
        setTimeout(() => cameraRef.current?.captureNow(), 80);
        break;
        // @ts-ignore
      case 'photo_upload':
        setTimeout(() => cameraRef.current?.confirmSaveNow(), 80);
        break;
    }
  };

  const { toggleRealtime, analyzer, sendRealtime, muted, setMuted, callState } = useRealtime(
    user,
    handleServerMessage,
  );

  const handleVoice = async () => {
    if (callState === 'idle') {
      console.log('Starting voice call');
      setMuted(true);
    } else if (callState === 'call') {
      const response = confirm(
        'Are you sure you want to end the voice call? You will not be able to send messages until you start a new call.',
      );
      if (response) {
        console.log('Ending voice call');
      } else {
        console.log('Not ending voice call');
        return;
      }
    }
    toggleRealtime();
  };

  const setCurrentImage = (image: string) => {
    if (!imageFunctionCall) {
      console.log('No image function call to set image for');
      return;
    }

    const setImage = async (img: string) => {
      const args = {
        ...imageFunctionCall.arguments,
        image: img,
      };

      sendRealtime({
        id: imageFunctionCall.id,
        type: 'function_completion',
        call_id: imageFunctionCall.call_id,
        output: `This is a message from the function call that it is in progress.
        You can ignore it and continue the conversation until the function call is completed.`,
      });

      const api = `/api/agent/${user.key}`;
      console.log('Sending function call to agent', api, imageFunctionCall);
      await apiClient.post(
        api,
        AgentExecuteResponseSchema,
        {
          body: {
            call_id: imageFunctionCall.call_id,
            id: imageFunctionCall.id,
            name: imageFunctionCall.name,
            arguments: args,
          },
        }
      )
    };

    fetchCachedImage(image, setImage);
  };

  return (
    <AnimatedView>
      <div>
        <VoiceTool onClick={handleVoice} callState={callState} analyzer={analyzer} />
        <VideoImagePicker
          show={showCapture}
          setShow={setShowCapture}
          setCurrentImage={setCurrentImage}
        />
        {/* Fotofunktion nur auf expliziten Request (photo_request) anzeigen */}
        {showPhotoCapture && (
          <div className='my-4'>
            <CameraCapture
              apiBase={API_ENDPOINT}
              userId={user?.key}
              onCaptured={async (res) => {
                try {
                  await sendRealtime({ type: 'photo_upload_done', image_url: res.image_url } as any);
                } catch (e) {
                  console.warn('notify photo_upload_done failed', e);
                }
              }}
              ref={cameraRef}
            />
          </div>
        )}
        <FileImagePicker ref={filePickerRef} setCurrentImage={setCurrentImage} />

        <ImageParamsDialog
            open={showParamsDialog}
            onClose={() => setShowParamsDialog(false)}
            defaultPrompt={pendingPrompt}
            loading={paramsLoading}
            error={paramsError}
            onSubmit={async (params: ImageParams) => {
              try {
                setParamsError(null);
                setParamsLoading(true);
                const api = `/functions/execute`;
                const body = {
                  function_name: 'generate_image',
                  parameters: {
                    prompt: pendingPrompt,
                    size: params.size,
                    quality: params.quality,
                    style: params.style,
                    user_id: user.key,
                    session_id: user.key, // falls keine separate Session-ID vorhanden
                  },
                };
                await apiClient.post(api, z.any(), { body })
                setShowParamsDialog(false);
              } catch (e: any) {
                setParamsError(e?.message ?? 'Fehler beim Auslösen der Generierung');
              } finally {
                setParamsLoading(false);
              }
            }}
        />

        {callState === 'call' && (
          <div
            className={clsx(styles.muteButton, muted ? styles.muted : styles.unmuted)}
            onClick={() => setMuted((muted) => !muted)}
          >
            {muted ? <BsMicMute size={24} /> : <BsMic size={24} />}
          </div>
        )}
        <ImageGallery/>
      </div>
    </AnimatedView>
  );
};

export default Keiko;
